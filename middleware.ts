import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware gate: unauthenticated traffic to protected routes gets
 * redirected to /login?next=<original>. The login flow, magic-link
 * consumption, and API auth endpoints stay open — matcher excludes
 * them entirely.
 *
 * We do NOT verify the session against the DB here (middleware can't
 * import Prisma cleanly). We only check for cookie *presence*. Actual
 * validation happens in getSession() on each page/route. If someone
 * sends a garbage cookie, they'll get through to the route but
 * getSession() returns null and the page redirects again.
 */
const PORTAL_SESSION_COOKIE = 'portal_session'

export const config = {
  matcher: [
    /*
     * Match everything EXCEPT:
     *   - _next internals
     *   - favicon / robots / sitemap / public static files
     *   - /login page
     *   - /api/auth/* (magic-link request, consume, logout)
     *   - /api/bff/* (service-to-service, HMAC-authed separately)
     *   - /api/portal/* (session-gated JSON APIs — must return JSON 401 not redirect)
     *   - /api/health (liveness)
     */
    '/((?!_next/|favicon|robots|sitemap|login|impersonate|api/auth/|api/bff/|api/portal/|api/health).*)',
  ],
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get(PORTAL_SESSION_COOKIE)?.value
  if (token) return NextResponse.next()

  const loginUrl = new URL('/login', req.url)
  const pathname = req.nextUrl.pathname
  if (pathname !== '/' && !pathname.startsWith('/login')) {
    loginUrl.searchParams.set('next', pathname + req.nextUrl.search)
  }
  return NextResponse.redirect(loginUrl)
}
