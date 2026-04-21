import 'server-only'
import { createHmac } from 'node:crypto'

/**
 * Sign + POST to a backend BFF endpoint (TicketHub or DocHub).
 * Uses the same HMAC scheme both backends verify:
 *   signature = sha256(secret, `${timestamp}.${body}`)
 * Headers: X-Portal-Timestamp, X-Portal-Signature
 *
 * Throws on non-2xx with a concise message so callers can record
 * descriptive FAILED outbound rows.
 */
export async function signedPost<T = unknown>(
  baseUrl: string,
  path: string,
  payload: unknown,
): Promise<T> {
  const secret = process.env.PORTAL_BFF_SECRET
  if (!baseUrl) throw new Error('BFF base URL not configured')
  if (!secret) throw new Error('PORTAL_BFF_SECRET not configured')

  const body = JSON.stringify(payload)
  const ts = Date.now().toString()
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Portal-Timestamp': ts,
      'X-Portal-Signature': `sha256=${sig}`,
    },
    body,
    // BFF reads are always dynamic — no caching at the fetch layer.
    cache: 'no-store',
  })

  if (!res.ok) {
    let detail = ''
    try {
      const json = (await res.json()) as { error?: string }
      detail = json.error ?? ''
    } catch {
      detail = (await res.text().catch(() => '')).slice(0, 200)
    }
    throw new Error(`BFF HTTP ${res.status}${detail ? ': ' + detail : ''}`)
  }

  return (await res.json()) as T
}
