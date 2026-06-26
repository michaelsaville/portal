import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { hasPermission } from '@/app/lib/permissions'
import PortalSection, { NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { VendorAccessClient } from './VendorAccessClient'

export const dynamic = 'force-dynamic'

export default async function VendorAccessPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/vendor-access')
  if (session.aggregateMode) return <AggregateNotSupported title="Vendor access" />
  const clientId = session.activeClientId
  if (!clientId) return <NotLinkedYet title="Vendor access" />

  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { role: true, permissions: true },
  })
  if (!link) return <NotLinkedYet title="Vendor access" />

  if (!hasPermission(link.role, link.permissions, 'vendorAccess')) {
    return (
      <PortalSection
        title="Vendor access"
        subtitle="Vendor access isn't enabled on your account."
      >
        <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
          Ask your portal owner or PCC2K to grant vendor-access management.
        </p>
      </PortalSection>
    )
  }

  return (
    <PortalSection
      title="Vendor access"
      subtitle="Choose exactly which of your documents, files and vault credentials each of your vendors can see. Your vendors only ever see what you add here."
    >
      <VendorAccessClient />
    </PortalSection>
  )
}
