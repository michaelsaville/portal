'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'

/**
 * Switch which client a vendor is viewing. Only flips to a client the vendor
 * actually has an active PortalVendorClientGrant for — defense against a
 * crafted form post. Stores the choice as the session's activeVendorGrantId
 * (a clientId) and revalidates so the shared-access page re-renders.
 */
export async function selectVendorGrantAction(formData: FormData) {
  const session = await getSession()
  if (!session) return
  if (session.user.persona !== 'VENDOR') return

  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return

  const grant = await prisma.portalVendorClientGrant.findFirst({
    where: { portalUserId: session.user.id, clientId, isActive: true },
    select: { id: true },
  })
  if (!grant) return

  await prisma.portalSession.update({
    where: { id: session.sessionId },
    data: { activeVendorGrantId: clientId },
  })
  revalidatePath('/vendor/shared')
}
