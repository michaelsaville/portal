import 'server-only'
import { NextResponse } from 'next/server'
import { signedPost } from '@/app/lib/bff-client'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { hasPermission } from '@/app/lib/permissions'

export interface VaultActor {
  portalUserId: string
  clientId: string
  isPortalOwner: boolean
}

export type GateResult =
  | { ok: true; actor: VaultActor }
  | { ok: false; res: NextResponse }

/**
 * Common gate for every /api/portal/vault/* route. Confirms:
 *   - signed-in session
 *   - active client is set
 *   - user has the `vault` permission on the active client's link
 *
 * Returns the actor block needed for downstream BFF calls.
 */
export async function requireVaultActor(): Promise<GateResult> {
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
    select: { role: true, permissions: true },
  })
  if (!link) {
    return { ok: false, res: NextResponse.json({ error: 'Not linked' }, { status: 403 }) }
  }
  if (!hasPermission(link.role, link.permissions, 'vault')) {
    return { ok: false, res: NextResponse.json({ error: 'No vault access' }, { status: 403 }) }
  }
  return {
    ok: true,
    actor: {
      portalUserId: session.user.id,
      clientId,
      isPortalOwner: link.role === 'OWNER',
    },
  }
}

const DOCHUB = process.env.DOCHUB_BFF_URL ?? ''

export async function vaultBff<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return signedPost<T>(DOCHUB, `/api/bff/portal/dochub/vault/${path}`, payload)
}
