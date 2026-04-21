import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { issueMagicLink, audit } from '@/app/lib/portal-auth'

const BodySchema = z.object({
  email: z.string().email().max(320).transform((s) => s.toLowerCase().trim()),
})

/**
 * POST /api/auth/password/request-reset — enumeration-resistant like
 * the magic-link request endpoint. Always returns ok; reset link is
 * issued + logged only when a real account matches.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: true })

  const { email } = parsed.data
  const user = await prisma.portalUser.findUnique({ where: { email } })
  if (!user || !user.isActive) {
    await audit('PASSWORD_RESET_REQUEST_UNKNOWN', { data: { email } })
    return NextResponse.json({ ok: true })
  }

  const { token, expiresAt } = await issueMagicLink({
    portalUserId: user.id,
    purpose: 'PASSWORD_RESET',
    ttlMinutes: 60,
  })
  await audit('PASSWORD_RESET_REQUEST', { portalUserId: user.id })

  const base = process.env.PUBLIC_URL ?? 'https://portal.pcc2k.com'
  const link = `${base.replace(/\/$/, '')}/login/reset/${token}`
  console.log(
    `[magic-link][PASSWORD_RESET] user=${user.email} exp=${expiresAt.toISOString()} link=${link}`,
  )

  return NextResponse.json({ ok: true })
}
