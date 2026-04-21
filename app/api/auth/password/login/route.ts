import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/app/lib/prisma'
import { verifyPassword } from '@/app/lib/password'
import { createSession, audit } from '@/app/lib/portal-auth'

const BodySchema = z.object({
  email: z.string().email().max(320).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1).max(1024),
})

/**
 * POST /api/auth/password/login — email + password → session cookie.
 *
 * Same-timing on the "unknown email" path: verifyPassword is called
 * against a dummy hash so the request takes roughly the same wall
 * time whether the account exists or not. No hard rate-limit here —
 * future enhancement adds fail2ban-style IP lockout via the audit
 * table.
 */
const DUMMY_HASH =
  'deadbeefdeadbeefdeadbeefdeadbeef:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 },
    )
  }
  const { email, password } = parsed.data

  const user = await prisma.portalUser.findUnique({ where: { email } })
  const stored = user?.passwordHash ?? DUMMY_HASH
  const ok = await verifyPassword(password, stored)

  if (!user || !user.isActive || !user.passwordHash || !ok) {
    await audit('LOGIN_PASSWORD_FAIL', {
      portalUserId: user?.id ?? null,
      data: { email },
    })
    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 },
    )
  }

  await createSession(user.id)
  await audit('LOGIN_PASSWORD_OK', { portalUserId: user.id })
  return NextResponse.json({ ok: true })
}
