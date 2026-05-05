import 'server-only'
import { NextResponse } from 'next/server'
import { signedPost } from '@/app/lib/bff-client'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'

export interface PendingActor {
  portalUserId: string
  clientId: string
  /** TH contact id linked to this portal user at the active client. */
  contactId: string
}

export type GateResult =
  | { ok: true; actor: PendingActor }
  | { ok: false; res: NextResponse }
  | { ok: 'no-mapping' }

/**
 * Common gate for /api/portal/reminders/*. Confirms session + active
 * client + that the user's link has a mapped TH contact id. When the
 * mapping is missing returns a special 'no-mapping' marker so callers
 * can treat it as an empty list rather than an error (the staff side
 * of the portal needs to populate `tickethubContactId` first).
 */
export async function requirePendingActor(): Promise<GateResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const clientId = session.activeClientId
  if (!clientId) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'No active company' }, { status: 400 }),
    }
  }
  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { tickethubContactId: true },
  })
  if (!link) {
    return { ok: false, res: NextResponse.json({ error: 'Not linked' }, { status: 403 }) }
  }
  if (!link.tickethubContactId) {
    return { ok: 'no-mapping' }
  }
  return {
    ok: true,
    actor: {
      portalUserId: session.user.id,
      clientId,
      contactId: link.tickethubContactId,
    },
  }
}

const TICKETHUB = process.env.TICKETHUB_BFF_URL ?? ''

export async function reminderBff<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return signedPost<T>(TICKETHUB, `/api/bff/portal/tickethub/reminders/${path}`, payload)
}
