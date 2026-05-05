import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware gates:
 *
 * 1. Host-aware persona routing (Phase 7). When the request comes in
 *    on `vendor.pcc2k.com`, vendor pages live under `/vendor/...`.
 *    Plain paths like `/` get rewritten to the vendor home so the URL
 *    bar stays clean for the vendor user. Customer paths on the
 *    vendor host return 404. The reverse holds on portal.pcc2k.com:
 *    /vendor/* paths return 404.
 *
 * 2. Auth presence. Unauthenticated traffic to a protected route gets
 *    redirected to the right login (vendor host → /vendor/login,
 *    customer host → /login). We do NOT verify the cookie against the
 *    DB here — middleware can't import Prisma cleanly. Actual session
 *    validation happens in getSession() on each page/route.
 */

const PORTAL_SESSION_COOKIE = 'portal_session'
const VENDOR_HOSTS = new Set(['vendor.pcc2k.com', 'vendor.localhost'])

export const config = {
  matcher: [
    /*
     * Match everything EXCEPT:
     *   - _next internals
     *   - favicon / robots / sitemap / public static files
     *   - /api/auth/* (magic-link request, consume, logout)
     *   - /api/bff/* (service-to-service, HMAC-authed separately)
     *   - /api/portal/* (session-gated JSON APIs — must return JSON 401 not redirect)
     *   - /api/vendor/* (vendor-side gated JSON APIs — same pattern as /api/portal/*)
     *   - /api/health (liveness)
     */
    '/((?!_next/|favicon|robots|sitemap|api/auth/|api/bff/|api/portal/|api/vendor/|api/health).*)',
  ],
}

function isVendorHost(req: NextRequest): boolean {
  const host = req.headers.get('host')?.split(':')[0]?.toLowerCase() ?? ''
  return VENDOR_HOSTS.has(host)
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const onVendorHost = isVendorHost(req)
  const token = req.cookies.get(PORTAL_SESSION_COOKIE)?.value

  // ── Host-aware route gating ────────────────────────────────────────
  if (onVendorHost) {
    // Customer-only paths on the vendor host → 404.
    if (
      pathname.startsWith('/login') ||
      pathname.startsWith('/account') ||
      pathname.startsWith('/tickets') ||
      pathname.startsWith('/invoices') ||
      pathname.startsWith('/estimates') ||
      pathname.startsWith('/assets') ||
      pathname.startsWith('/documents') ||
      pathname.startsWith('/contacts') ||
      pathname.startsWith('/locations') ||
      pathname.startsWith('/licenses') ||
      pathname.startsWith('/domains') ||
      pathname.startsWith('/vault') ||
      pathname.startsWith('/pending') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/impersonate')
    ) {
      return new NextResponse(null, { status: 404 })
    }
    // Bare `/` on the vendor host renders /vendor (no rewrite needed —
    // we route it via the route group instead). For now, redirect.
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/vendor', req.url))
    }
    // Other paths starting with `/vendor/...` work as-is.
    if (!pathname.startsWith('/vendor')) {
      return NextResponse.rewrite(new URL(`/vendor${pathname}`, req.url))
    }
  } else {
    // Customer host: vendor route tree returns 404 directly.
    if (pathname.startsWith('/vendor')) {
      return new NextResponse(null, { status: 404 })
    }
  }

  // ── Auth presence ──────────────────────────────────────────────────
  if (token) return NextResponse.next()

  if (onVendorHost) {
    // Don't loop on the login / invite / set-password paths themselves.
    if (
      pathname === '/vendor/login' ||
      pathname.startsWith('/vendor/invite') ||
      pathname === '/vendor'
    ) {
      return NextResponse.next()
    }
    const loginUrl = new URL('/vendor/login', req.url)
    loginUrl.searchParams.set('next', pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // Customer side — pass /login / /login/reset through, redirect everything
  // else to /login.
  if (pathname === '/' || pathname.startsWith('/login')) {
    return NextResponse.next()
  }
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search)
  return NextResponse.redirect(loginUrl)
}
