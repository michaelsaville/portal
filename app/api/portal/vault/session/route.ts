import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { verifyPassword } from '@/app/lib/password'
import {
  getActiveVaultSession,
  unlockVault,
  lockVault,
} from '@/app/lib/vault-session'
import { requireVaultActor } from '../_helpers'

export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  const active = await getActiveVaultSession(
    gate.actor.portalUserId,
    gate.actor.clientId,
  )
  if (!active) return NextResponse.json({ unlocked: false })
  return NextResponse.json({ unlocked: true, expiresAt: active.expiresAt })
}

export async function POST(req: NextRequest) {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  const { password } = (await req.json()) as { password?: string }
  if (!password) {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }
  const u = await prisma.portalUser.findUnique({
    where: { id: gate.actor.portalUserId },
    select: { passwordHash: true },
  })
  if (!u?.passwordHash) {
    return NextResponse.json(
      { error: 'No password set. Set one in Account first.' },
      { status: 400 },
    )
  }
  const ok = await verifyPassword(password, u.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }
  const expiresAt = await unlockVault(gate.actor.portalUserId, gate.actor.clientId)
  return NextResponse.json({ unlocked: true, expiresAt })
}

export async function DELETE() {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  await lockVault(gate.actor.portalUserId, gate.actor.clientId)
  return NextResponse.json({ success: true })
}
