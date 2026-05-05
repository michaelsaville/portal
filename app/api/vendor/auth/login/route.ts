import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { verifyPassword } from '@/app/lib/password'
import { createSession } from '@/app/lib/portal-auth'

export const runtime = 'nodejs'

/**
 * Vendor login by email + password. Distinct from the customer-side
 * magic-link flow — vendors hit the portal repeatedly (POs, RFQs)
 * so passwords are the daily-driver auth (proposal §3.3).
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = (await req.json()) as { email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password required' },
      { status: 400 },
    )
  }

  const user = await prisma.portalUser.findUnique({
    where: { email_persona: { email, persona: 'VENDOR' } },
  })
  if (!user || !user.isActive || !user.passwordHash) {
    // Same shape regardless of which check failed — don't help an
    // attacker enumerate vendor accounts.
    return NextResponse.json(
      { error: 'Email or password is incorrect' },
      { status: 401 },
    )
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) {
    return NextResponse.json(
      { error: 'Email or password is incorrect' },
      { status: 401 },
    )
  }

  await createSession(user.id)
  return NextResponse.json({ ok: true })
}
