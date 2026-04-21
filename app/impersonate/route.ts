import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/app/lib/prisma'
import { verifyImpersonationToken } from '@/app/lib/portal-impersonate'
import { hashToken } from '@/app/lib/tokens'

export const dynamic = 'force-dynamic'

const SESSION_COOKIE = 'portal_session'
const IMPERSONATION_USER_EMAIL = 'impersonator@internal.pcc2k.com'
const SESSION_TTL_MINUTES = 30

/**
 * GET /impersonate?token=<signed>
 *
 * Redirects into a scoped read-only-ish portal session when the token
 * verifies. The session carries impersonatedStaffEmail so every page's
 * chrome renders a banner and every write server action gates out.
 *
 * Tokens live ~2 minutes (just long enough for staff to click through
 * from TicketHub); sessions live 30 minutes. Tokens can technically be
 * reused within their TTL — if that becomes a problem, swap to nonce
 * storage, but for an internal staff tool it's fine.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?impersonation=missing-token', req.url))
  }

  const secret = process.env.PORTAL_BFF_SECRET ?? ''
  const verify = verifyImpersonationToken(token, secret)
  if (!verify.ok) {
    return NextResponse.redirect(
      new URL(`/login?impersonation=${encodeURIComponent(verify.reason)}`, req.url),
    )
  }
  const { claims } = verify

  // One shared synthetic PortalUser for all impersonation sessions.
  // Isolating it behind an @internal email stops collision with a real
  // portal user and makes the audit view ("who's logged in right now")
  // obvious at a glance.
  const synthetic = await prisma.portalUser.upsert({
    where: { email: IMPERSONATION_USER_EMAIL },
    update: {},
    create: {
      email: IMPERSONATION_USER_EMAIL,
      name: 'PCC2K Staff (impersonating)',
      isActive: true,
    },
    select: { id: true },
  })

  const rawTok = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000)

  await prisma.portalSession.create({
    data: {
      token: hashToken(rawTok),
      portalUserId: synthetic.id,
      activeClientId: claims.dochubClientId,
      impersonatedStaffEmail: claims.staffEmail,
      expiresAt,
      userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    },
  })

  await prisma.portalAuditEvent.create({
    data: {
      portalUserId: synthetic.id,
      type: 'IMPERSONATION_START',
      clientId: claims.dochubClientId,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
      data: {
        staffEmail: claims.staffEmail,
        staffName: claims.staffName,
        clientName: claims.clientName,
      },
    },
  })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, rawTok, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  return NextResponse.redirect(new URL('/', req.url))
}
