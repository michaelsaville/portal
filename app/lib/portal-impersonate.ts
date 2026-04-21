import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Shared token format for TicketHub → portal "view as client" tunnel.
 * Signed with PORTAL_BFF_SECRET (reused — same trust boundary).
 *
 * Encoding is `<base64url(payload)>.<hex(hmac)>` — JWT-ish but
 * intentionally not JWT so we don't pull in a library for a single
 * internal token type.
 */

export interface ImpersonationClaims {
  dochubClientId: string
  clientName: string
  staffEmail: string
  staffName: string
  iat: number
  exp: number
}

const TTL_SECONDS = 120

export function signImpersonationToken(
  claims: Omit<ImpersonationClaims, 'iat' | 'exp'>,
  secret: string,
): string {
  if (!secret) throw new Error('impersonation secret missing')
  const now = Math.floor(Date.now() / 1000)
  const full: ImpersonationClaims = { ...claims, iat: now, exp: now + TTL_SECONDS }
  const payload = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export type VerifyOk = { ok: true; claims: ImpersonationClaims }
export type VerifyErr = { ok: false; reason: string }

export function verifyImpersonationToken(
  token: string,
  secret: string,
): VerifyOk | VerifyErr {
  if (!secret) return { ok: false, reason: 'impersonation secret missing' }
  const dot = token.lastIndexOf('.')
  if (dot < 1) return { ok: false, reason: 'malformed token' }
  const payloadB64 = token.slice(0, dot)
  const providedHex = token.slice(dot + 1)

  const expectedHex = createHmac('sha256', secret).update(payloadB64).digest('hex')
  const a = Buffer.from(providedHex, 'hex')
  const b = Buffer.from(expectedHex, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' }
  }

  let claims: ImpersonationClaims
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as ImpersonationClaims
  } catch {
    return { ok: false, reason: 'invalid payload' }
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp < now) {
    return { ok: false, reason: 'token expired' }
  }
  if (!claims.dochubClientId || !claims.staffEmail) {
    return { ok: false, reason: 'claims incomplete' }
  }
  return { ok: true, claims }
}
