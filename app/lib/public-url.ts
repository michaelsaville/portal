import type { NextRequest } from 'next/server'

/**
 * Public origin for building redirect URLs in route handlers.
 *
 * Inside the standalone container `req.url` resolves to the bind address
 * (`https://0.0.0.0:3000`), so `new URL(path, req.url)` sends the browser
 * somewhere unreachable. nginx forwards the real Host, so prefer the
 * forwarded headers and fall back to req.url only for local dev.
 */
export function publicUrl(req: NextRequest, path: string): URL {
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    req.headers.get('host')?.trim()
  if (!host || host.startsWith('0.0.0.0')) return new URL(path, req.url)
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (host.startsWith('localhost') ? 'http' : 'https')
  return new URL(path, `${proto}://${host}`)
}
