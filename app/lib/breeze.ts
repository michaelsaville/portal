import 'server-only'
import { createHmac } from 'node:crypto'

/**
 * Breeze RMM broker (2026-11-12) — lets the portal open remote-desktop
 * sessions for customers who have a PortalRemoteGrant.
 *
 * Why a broker USER and not an API key: Breeze deliberately refuses every
 * machine principal on /remote/* (requireMfa() 403s API keys and partner
 * service principals), and the partner policy requires MFA. So the portal
 * signs in as one dedicated Breeze user whose role carries only
 * `devices:read` + `remote:access`, completing the TOTP step itself.
 *
 * The broker account can reach every customer device, so the real access
 * gate is the portal: /api/portal/remote/connect checks the grant, the
 * active client and the device's org before it ever calls here.
 *
 * Env:
 *   BREEZE_API_URL            https://breeze.pcc2k.com
 *   BREEZE_BROKER_EMAIL       the broker user's login
 *   BREEZE_BROKER_PASSWORD
 *   BREEZE_BROKER_TOTP_SECRET base32 secret from the broker's MFA enrollment
 */

export interface BreezeDevice {
  id: string
  orgId: string
  hostname: string
  displayName: string | null
  osType: string | null
  status: string
  lastSeenAt: string | null
}

export class BreezeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

function apiBase(): string {
  return (process.env.BREEZE_API_URL ?? 'https://breeze.pcc2k.com').replace(/\/+$/, '')
}

export function breezeConfigured(): boolean {
  return !!(
    process.env.BREEZE_BROKER_EMAIL &&
    process.env.BREEZE_BROKER_PASSWORD &&
    process.env.BREEZE_BROKER_TOTP_SECRET
  )
}

// ── TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ──────────────────────────────

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const off = h[h.length - 1]! & 0x0f
  const n = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000
  return n.toString().padStart(6, '0')
}

// ── Token cache ─────────────────────────────────────────────────────────
// Breeze access tokens live 15 min; refresh needs a browser cookie + CSRF,
// so the broker simply signs in again when the cached token is near expiry.
// Breeze rejects a replayed TOTP code, so never sign in twice in one step.

// Breeze binds token issuance (login / MFA verify) to a `breeze_auth_binding`
// cookie: the first call answers 428 + Set-Cookie and expects a retry. Keep
// the cookies it hands us, like a browser would. Bearer calls don't need it.
// Next bundles this module separately into every route that imports it, so
// module-level state would mean one login (and one TOTP use) per route.
// Breeze allows only 5 logins / 5 min per email, so share one broker state
// per server process via globalThis.
interface BrokerState {
  jar: Map<string, string>
  cached: { token: string; expiresAt: number } | null
  inflight: Promise<string> | null
  lastStepUsed: number
}
const G = globalThis as typeof globalThis & { __pcc2kBreezeBroker?: BrokerState }
const st: BrokerState = (G.__pcc2kBreezeBroker ??= {
  jar: new Map(),
  cached: null,
  inflight: null,
  lastStepUsed: -1,
})
const jar = st.jar

function absorbCookies(res: Response) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';')
    const eq = pair!.indexOf('=')
    if (eq > 0) jar.set(pair!.slice(0, eq).trim(), pair!.slice(eq + 1).trim())
  }
}

async function authPost(path: string, body: unknown): Promise<{ res: Response; json: Record<string, unknown> }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${apiBase()}/api/v1${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    absorbCookies(res)
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const reason = String(json.reason ?? '')
    if (attempt < 2 && (reason === 'auth_binding_rotation_required' || reason === 'binding_refresh')) continue
    return { res, json }
  }
}


async function login(): Promise<string> {
  const email = process.env.BREEZE_BROKER_EMAIL ?? ''
  const password = process.env.BREEZE_BROKER_PASSWORD ?? ''
  const secret = process.env.BREEZE_BROKER_TOTP_SECRET ?? ''
  if (!email || !password || !secret) {
    throw new BreezeError('Remote access is not set up yet.', 503, 'BROKER_NOT_CONFIGURED')
  }

  const { res: r1, json: j1raw } = await authPost('/auth/login', { email, password })
  const j1 = j1raw as {
    mfaRequired?: boolean
    tempToken?: string
    tokens?: { accessToken?: string; expiresInSeconds?: number } | null
    error?: string
  }
  if (!r1.ok) {
    throw new BreezeError(`Breeze broker login failed: ${j1.error ?? r1.status}`, 502, 'BROKER_LOGIN')
  }
  if (!j1.mfaRequired && j1.tokens?.accessToken) {
    return remember(j1.tokens.accessToken, j1.tokens.expiresInSeconds)
  }
  if (!j1.tempToken) {
    throw new BreezeError('Breeze broker login returned no MFA challenge.', 502, 'BROKER_LOGIN')
  }

  let step = Math.floor(Date.now() / 30_000)
  if (step <= st.lastStepUsed) {
    // Same 30 s window as the previous sign-in — wait for a fresh code.
    await new Promise((r) => setTimeout(r, (step + 1) * 30_000 - Date.now() + 250))
    step = Math.floor(Date.now() / 30_000)
  }
  st.lastStepUsed = step

  const { res: r2, json: j2raw } = await authPost('/auth/mfa/verify', {
    code: totp(secret, step),
    tempToken: j1.tempToken,
    method: 'totp',
  })
  const j2 = j2raw as {
    tokens?: { accessToken?: string; expiresInSeconds?: number }
    error?: string
  }
  if (!r2.ok || !j2.tokens?.accessToken) {
    throw new BreezeError(`Breeze broker MFA failed: ${j2.error ?? r2.status}`, 502, 'BROKER_MFA')
  }
  return remember(j2.tokens.accessToken, j2.tokens.expiresInSeconds)
}

function remember(token: string, ttl?: number): string {
  st.cached = { token, expiresAt: Date.now() + Math.max(60, (ttl ?? 900) - 60) * 1000 }
  return token
}

async function accessToken(force = false): Promise<string> {
  if (!force && st.cached && st.cached.expiresAt > Date.now()) return st.cached.token
  if (!st.inflight) {
    st.inflight = login().finally(() => {
      st.inflight = null
    })
  }
  return st.inflight
}

async function breezeFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(attempt > 0)
    const res = await fetch(`${apiBase()}/api/v1${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    if (res.status === 401 && attempt === 0) {
      st.cached = null
      continue
    }
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string }
    if (!res.ok) {
      throw new BreezeError(body.error ?? `Breeze HTTP ${res.status}`, res.status, body.code)
    }
    return body
  }
  throw new BreezeError('Breeze rejected the broker token.', 502, 'BROKER_AUTH')
}

// ── Public API ──────────────────────────────────────────────────────────

export async function listOrgDevices(orgId: string): Promise<BreezeDevice[]> {
  const r = await breezeFetch<{ data?: BreezeDevice[] }>(
    `/devices?orgId=${encodeURIComponent(orgId)}&limit=200`,
  )
  return (r.data ?? []).map((d) => ({
    id: d.id,
    orgId: d.orgId,
    hostname: d.hostname,
    displayName: d.displayName ?? null,
    osType: d.osType ?? null,
    status: d.status,
    lastSeenAt: d.lastSeenAt ?? null,
  }))
}

export function deviceLabel(d: Pick<BreezeDevice, 'hostname' | 'displayName'>): string {
  return d.displayName?.trim() || d.hostname
}

/**
 * Create a desktop session and a one-time connect code, and return the
 * `breeze://connect` deep link Breeze Viewer opens — the same link the
 * Breeze web console builds (ConnectDesktopButton.tsx).
 */
export async function startDesktopSession(deviceId: string): Promise<{
  sessionId: string
  deepLink: string
}> {
  const session = await breezeFetch<{ id: string }>('/remote/sessions', {
    method: 'POST',
    body: JSON.stringify({ deviceId, type: 'desktop' }),
  })
  try {
    const code = await breezeFetch<{ code?: string }>(
      `/remote/sessions/${encodeURIComponent(session.id)}/desktop-connect-code`,
      { method: 'POST' },
    )
    if (!code.code) throw new BreezeError('Breeze returned no connect code.', 502)
    const deepLink =
      `breeze://connect?session=${encodeURIComponent(session.id)}` +
      `&code=${encodeURIComponent(code.code)}` +
      `&api=${encodeURIComponent(apiBase())}` +
      `&device=${encodeURIComponent(deviceId)}`
    return { sessionId: session.id, deepLink }
  } catch (err) {
    await endSession(session.id).catch(() => {})
    throw err
  }
}

export async function endSession(sessionId: string): Promise<void> {
  await breezeFetch(`/remote/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST' })
}
