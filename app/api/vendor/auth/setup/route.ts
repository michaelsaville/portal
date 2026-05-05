import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { hashPassword } from '@/app/lib/password'
import { createSession } from '@/app/lib/portal-auth'
import { hashToken } from '@/app/lib/tokens'

export const runtime = 'nodejs'

/**
 * Consume a VENDOR_INVITE magic link + set the new vendor user's
 * password. Body: { token, name, password }. On success the recipient
 * is signed in and we return ok: true; the page redirects to /vendor.
 *
 * The inviting staff member created the PortalUser row with
 * persona=VENDOR ahead of time and the magic link's payload tells us
 * which one to consume against. We refuse to consume a link that
 * doesn't already point at a VENDOR persona PortalUser — defense
 * against someone trying to elevate a customer account by reusing
 * a stolen invite token.
 */
export async function POST(req: NextRequest) {
  let body: { token?: string; name?: string; password?: string }
  try {
    body = (await req.json()) as {
      token?: string
      name?: string
      password?: string
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const token = body.token?.trim() ?? ''
  const name = body.name?.trim() ?? ''
  const password = body.password ?? ''
  if (!token || !name || !password) {
    return NextResponse.json(
      { error: 'Name and password are required' },
      { status: 400 },
    )
  }
  if (password.length < 12) {
    return NextResponse.json(
      { error: 'Password must be at least 12 characters' },
      { status: 400 },
    )
  }

  const link = await prisma.portalMagicLink.findUnique({
    where: { token: hashToken(token) },
    include: { portalUser: true },
  })
  if (!link) {
    return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  }
  if (link.purpose !== 'VENDOR_INVITE') {
    return NextResponse.json({ error: 'Wrong link type' }, { status: 400 })
  }
  if (link.consumedAt || link.usesLeft <= 0) {
    return NextResponse.json(
      { error: 'This invite link has already been used' },
      { status: 400 },
    )
  }
  if (link.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This invite link has expired' }, { status: 400 })
  }
  if (link.portalUser.persona !== 'VENDOR') {
    // Should never happen — but guards against a customer account
    // being re-personified via a stolen token.
    return NextResponse.json({ error: 'Account mismatch' }, { status: 403 })
  }

  const passwordHash = await hashPassword(password)
  await prisma.$transaction([
    prisma.portalUser.update({
      where: { id: link.portalUserId },
      data: { name, passwordHash, isActive: true },
    }),
    prisma.portalMagicLink.update({
      where: { id: link.id },
      data: { consumedAt: new Date(), usesLeft: 0 },
    }),
  ])

  await createSession(link.portalUserId)
  return NextResponse.json({ ok: true })
}
