import 'server-only'
import { cookies, headers } from 'next/headers'
import { prisma } from '@/app/lib/prisma'
import {
  randomMagicToken,
  randomSessionToken,
  hashToken,
} from '@/app/lib/tokens'
import type { PortalUser } from '@prisma/client'

export const SESSION_COOKIE = 'portal_session'
export const MAGIC_LINK_TTL_MINUTES = 15
export const SESSION_TTL_DAYS = 30
/** Hard cap — session can't slide forever even with continuous use. */
export const SESSION_ABSOLUTE_CAP_DAYS = 90

// ─── Magic links ───────────────────────────────────────────────────────

export async function issueMagicLink(input: {
  portalUserId: string
  purpose:
    | 'LOGIN'
    | 'PASSWORD_RESET'
    | 'ACTION_APPROVE_ESTIMATE'
    | 'ACTION_DECLINE_ESTIMATE'
    | 'ACTION_ACK_REMINDER'
    | 'ACTION_SNOOZE_REMINDER'
    | 'ACTION_CONFIRM_APPT'
    | 'ACTION_RESCHEDULE_APPT'
    | 'ACTION_PAY_INVOICE'
  payload?: Record<string, unknown>
  ttlMinutes?: number
  usesLeft?: number
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomMagicToken()
  const expiresAt = new Date(
    Date.now() + (input.ttlMinutes ?? MAGIC_LINK_TTL_MINUTES) * 60_000,
  )
  await prisma.portalMagicLink.create({
    data: {
      token: hashToken(token),
      portalUserId: input.portalUserId,
      purpose: input.purpose,
      payload: input.payload ? (input.payload as object) : undefined,
      usesLeft: input.usesLeft ?? 1,
      expiresAt,
    },
  })
  return { token, expiresAt }
}

/**
 * Validate a token and, if valid, decrement uses and return the link
 * row. Returns null when the token is unknown, expired, consumed, or
 * has no uses left. Never throws on input — bad input always => null.
 */
export async function consumeMagicLink(
  token: string,
  purpose: string,
): Promise<{
  portalUserId: string
  payload: unknown
} | null> {
  if (!token || token.length < 20) return null
  const hash = hashToken(token)
  const link = await prisma.portalMagicLink.findUnique({
    where: { token: hash },
  })
  if (!link) return null
  if (link.purpose !== purpose) return null
  if (link.consumedAt) return null
  if (link.expiresAt < new Date()) return null
  if (link.usesLeft < 1) return null

  const usesLeft = link.usesLeft - 1
  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
  await prisma.portalMagicLink.update({
    where: { id: link.id },
    data: {
      usesLeft,
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      consumedAt: usesLeft === 0 ? new Date() : null,
    },
  })
  return { portalUserId: link.portalUserId, payload: link.payload }
}

// ─── Sessions ──────────────────────────────────────────────────────────

export async function createSession(portalUserId: string): Promise<string> {
  const token = randomSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)
  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
  const userAgent = h.get('user-agent') ?? null

  await prisma.portalSession.create({
    data: {
      token: hashToken(token),
      portalUserId,
      expiresAt,
      ipAddress: ip,
      userAgent,
    },
  })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  await prisma.portalUser.update({
    where: { id: portalUserId },
    data: { lastLoginAt: new Date() },
  })

  return token
}

export interface ResolvedSession {
  sessionId: string
  user: PortalUser
  activeClientId: string | null
}

/**
 * Resolve the current session. Slides the expiry forward on every hit
 * (up to the absolute cap). Returns null when there's no valid session
 * for any reason — never throws.
 */
export async function getSession(): Promise<ResolvedSession | null> {
  const jar = await cookies()
  const cookie = jar.get(SESSION_COOKIE)?.value
  if (!cookie) return null

  const session = await prisma.portalSession.findUnique({
    where: { token: hashToken(cookie) },
    include: { portalUser: true },
  })
  if (!session) return null
  if (!session.portalUser.isActive) return null
  if (session.expiresAt < new Date()) return null

  // Absolute cap: don't slide past 90 days from creation.
  const cap = new Date(
    session.createdAt.getTime() + SESSION_ABSOLUTE_CAP_DAYS * 86_400_000,
  )
  const nextExpiry = new Date(
    Math.min(
      Date.now() + SESSION_TTL_DAYS * 86_400_000,
      cap.getTime(),
    ),
  )
  if (nextExpiry.getTime() !== session.expiresAt.getTime()) {
    await prisma.portalSession.update({
      where: { id: session.id },
      data: { expiresAt: nextExpiry, lastSeenAt: new Date() },
    })
  }

  return {
    sessionId: session.id,
    user: session.portalUser,
    activeClientId: session.activeClientId,
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const cookie = jar.get(SESSION_COOKIE)?.value
  if (cookie) {
    await prisma.portalSession
      .deleteMany({ where: { token: hashToken(cookie) } })
      .catch(() => {})
  }
  jar.delete(SESSION_COOKIE)
}

// ─── Audit ─────────────────────────────────────────────────────────────

export async function audit(
  type: string,
  opts: {
    portalUserId?: string | null
    clientId?: string | null
    data?: Record<string, unknown>
  } = {},
): Promise<void> {
  try {
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      null
    const userAgent = h.get('user-agent') ?? null
    await prisma.portalAuditEvent.create({
      data: {
        type,
        portalUserId: opts.portalUserId ?? null,
        clientId: opts.clientId ?? null,
        data: opts.data ? (opts.data as object) : undefined,
        ipAddress: ip,
        userAgent,
      },
    })
  } catch (err) {
    console.error('[portal-auth] audit failed', err)
  }
}
