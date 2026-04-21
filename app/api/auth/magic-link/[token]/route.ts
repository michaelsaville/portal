import { NextResponse, type NextRequest } from 'next/server'
import {
  consumeMagicLink,
  createSession,
  audit,
} from '@/app/lib/portal-auth'

/**
 * GET /api/auth/magic-link/:token
 *
 * The user clicks the emailed link; we verify, consume one use, and
 * mint a session cookie. On success we 302 to `/` (or to `next=` when
 * set). Failure redirects back to /login with an error code.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const next = req.nextUrl.searchParams.get('next')
  const safeNext =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
  const base = new URL(req.url)

  const result = await consumeMagicLink(token, 'LOGIN')
  if (!result) {
    await audit('LOGIN_MAGIC_INVALID', { data: { token: token.slice(0, 6) } })
    const loginUrl = new URL('/login', base)
    loginUrl.searchParams.set('error', 'link-expired')
    return NextResponse.redirect(loginUrl, { status: 302 })
  }

  await createSession(result.portalUserId)
  await audit('LOGIN_MAGIC_CONSUMED', { portalUserId: result.portalUserId })

  const dest = new URL(safeNext, base)
  return NextResponse.redirect(dest, { status: 302 })
}
