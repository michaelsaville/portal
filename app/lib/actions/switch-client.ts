'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'

/**
 * Switch the current session's active client. Only allowed to flip to
 * a client the user has a `PortalUserClientLink` row for — defense
 * against a crafted form post.
 *
 * Revalidates `/` so the next render of any portal page picks up the
 * new activeClientId (every section page is `dynamic = 'force-dynamic'`).
 */
export async function switchClientAction(formData: FormData) {
  const session = await getSession()
  if (!session) return

  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return

  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { id: true },
  })
  if (!link) return

  await prisma.portalSession.update({
    where: { id: session.sessionId },
    data: { activeClientId: clientId },
  })

  revalidatePath('/', 'layout')
}
