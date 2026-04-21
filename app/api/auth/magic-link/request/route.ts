import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { issueMagicLink, audit } from '@/app/lib/portal-auth'

const BodySchema = z.object({
  email: z.string().email().max(320).transform((s) => s.toLowerCase().trim()),
})

/**
 * POST /api/auth/magic-link/request
 *
 * Always returns 200 with `{ ok: true }`, regardless of whether the
 * email matches a known user. Prevents account enumeration. Real
 * magic-link issuance happens silently in the background when the
 * email IS known.
 *
 * Email delivery is NOT wired in Phase 1 — the link is logged to the
 * server console with a distinctive prefix so the flow can be tested
 * end-to-end while the BFF mailer is still being built. Phase 2 flips
 * this to a call into TicketHub's M365 Graph sender.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Expected JSON body' },
      { status: 400 },
    )
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    // Still respond uniformly to the client — but skip the DB work.
    return NextResponse.json({ ok: true })
  }

  const { email } = parsed.data

  const user = await prisma.portalUser.findUnique({ where: { email } })
  if (!user || !user.isActive) {
    // Audit the attempt against an unknown/inactive email so we can
    // see if someone is probing, but don't leak the state to the
    // caller.
    await audit('LOGIN_MAGIC_REQUEST_UNKNOWN', { data: { email } })
    return NextResponse.json({ ok: true })
  }

  const { token, expiresAt } = await issueMagicLink({
    portalUserId: user.id,
    purpose: 'LOGIN',
  })
  await audit('LOGIN_MAGIC_REQUEST', { portalUserId: user.id })

  const base = process.env.PUBLIC_URL ?? 'https://portal.pcc2k.com'
  const link = `${base.replace(/\/$/, '')}/api/auth/magic-link/${token}`

  // Phase 1: log-only. Grep the container logs for this prefix.
  console.log(
    `[magic-link][LOGIN] user=${user.email} exp=${expiresAt.toISOString()} link=${link}`,
  )

  return NextResponse.json({ ok: true })
}
