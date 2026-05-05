'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { lockAllVaults } from '@/app/lib/vault-session'
import { AGGREGATE_SENTINEL } from '@/app/lib/aggregate'

/**
 * Switch the current session's active client. Only allowed to flip to
 * a client the user has a `PortalUserClientLink` row for — defense
 * against a crafted form post.
 *
 * Side effect: locks every active vault session for this user. Vault
 * unlock is per-(user, client) and switching companies must drop the
 * unlocked window so it doesn't bleed across companies. This applies
 * equally when entering aggregate mode — vaults aren't accessible in
 * aggregate, so locking is the right default.
 *
 * Revalidates `/` so the next render of any portal page picks up the
 * new active state.
 */
export async function switchClientAction(formData: FormData) {
  const session = await getSession()
  if (!session) return
  if (session.impersonatedStaffEmail) return // staff tunnel stays on its chosen client

  const raw = String(formData.get('clientId') ?? '')
  if (!raw) return

  if (raw === AGGREGATE_SENTINEL) {
    if (session.aggregateMode) return
    await lockAllVaults(session.user.id)
    await prisma.portalSession.update({
      where: { id: session.sessionId },
      data: { aggregateMode: true },
    })
    revalidatePath('/', 'layout')
    return
  }

  // Single-company target.
  if (
    raw === session.activeClientId &&
    !session.aggregateMode
  ) {
    return
  }

  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId: raw },
    select: { id: true },
  })
  if (!link) return

  await lockAllVaults(session.user.id)

  await prisma.portalSession.update({
    where: { id: session.sessionId },
    data: { activeClientId: raw, aggregateMode: false },
  })

  revalidatePath('/', 'layout')
}
