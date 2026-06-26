import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify an inbound HMAC-signed BFF call (currently: DocHub → portal vendor
 * provisioning). Mirrors the scheme our own signedPost() uses outbound and
 * the one DocHub/TicketHub verify, so the shared PORTAL_BFF_SECRET works in
 * both directions:
 *   canonical = `${timestampMs}.${rawBody}`
 *   signature = HMAC-SHA256(secret, canonical) as lowercase hex
 *   headers: X-Portal-Timestamp, X-Portal-Signature: sha256=<hex>
 * Replay window ±5 minutes.
 */

const REPLAY_WINDOW_MS = 5 * 60 * 1000
const PREFIX = 'sha256='

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; status: number }

export function verifyInboundHmac(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
): VerifyResult {
  const secret = process.env.PORTAL_BFF_SECRET
  if (!secret) return { ok: false, reason: 'PORTAL_BFF_SECRET not configured', status: 500 }
  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: 'missing signature or timestamp header', status: 401 }
  }
  if (!signatureHeader.startsWith(PREFIX)) {
    return { ok: false, reason: 'unsupported signature format', status: 401 }
  }

  const ts = parseInt(timestampHeader, 10)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp', status: 401 }
  if (Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return { ok: false, reason: 'timestamp outside replay window', status: 401 }
  }

  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
  const provided = signatureHeader.slice(PREFIX.length)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch', status: 401 }
  }
  return { ok: true }
}
