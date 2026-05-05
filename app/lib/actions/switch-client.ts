'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { lockAllVaults } from '@/app/lib/vault-session'

/**
 * Switch the current session's active client. Only allowed to flip to
 * a client the user has a `PortalUserClientLink` row for — defense
 * against a crafted form post.
 *
 * Side effect: locks every active vault session for this user. Vault
 * unlock is per-(user, client) and switching companies must drop the
 * unlocked window so it doesn't bleed across companies.
 *
 * Revalidates `/` so the next render of any portal page picks up the
 * new activeClientId (every section page is `dynamic = 'force-dynamic'`).
 */
export async function switchClientAction(formData: FormData) {
  const session = await getSession()
  if (!session) return
  if (session.impersonatedStaffEmail) return // staff tunnel stays on its chosen client

  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  if (clientId === session.activeClientId) return

  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { id: true },
  })
  if (!link) return

  await lockAllVaults(session.user.id)

  await prisma.portalSession.update({
    where: { id: session.sessionId },
    data: { activeClientId: clientId },
  })

  revalidatePath('/', 'layout')
}
