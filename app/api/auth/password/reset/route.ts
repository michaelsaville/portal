import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { hashPassword, validatePassword } from '@/app/lib/password'
import { consumeMagicLink, createSession, audit } from '@/app/lib/portal-auth'

const BodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(1024),
})

/**
 * POST /api/auth/password/reset — verify PASSWORD_RESET token, hash
 * and store the new password, sign the user in. Returns ok:false for
 * any failure case; the client shows a generic "link expired or
 * already used" message.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const policyError = validatePassword(parsed.data.password)
  if (policyError) {
    return NextResponse.json({ error: policyError }, { status: 400 })
  }

  const result = await consumeMagicLink(parsed.data.token, 'PASSWORD_RESET')
  if (!result) {
    await audit('PASSWORD_RESET_INVALID', {
      data: { token: parsed.data.token.slice(0, 6) },
    })
    return NextResponse.json(
      { error: 'Link expired or already used' },
      { status: 400 },
    )
  }

  const hash = await hashPassword(parsed.data.password)
  await prisma.portalUser.update({
    where: { id: result.portalUserId },
    data: { passwordHash: hash },
  })
  await createSession(result.portalUserId)
  await audit('PASSWORD_RESET_OK', { portalUserId: result.portalUserId })

  return NextResponse.json({ ok: true })
}
