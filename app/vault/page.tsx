import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { hasPermission } from '@/app/lib/permissions'
import PortalSection, { NotLinkedYet } from '@/app/components/PortalSection'
import { VaultClient } from './VaultClient'

export const dynamic = 'force-dynamic'

export default async function VaultPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/vault')
  const clientId = session.activeClientId
  if (!clientId) {
    return <NotLinkedYet title="Vault" />
  }
  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { role: true, permissions: true },
  })
  if (!link) {
    return <NotLinkedYet title="Vault" />
  }
  if (!hasPermission(link.role, link.permissions, 'vault')) {
    return (
      <PortalSection
        title="Vault"
        subtitle="Vault access isn't enabled on your account."
      >
        <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
          Ask your portal owner or PCC2K to grant vault access.
        </p>
      </PortalSection>
    )
  }

  const isOwner = link.role === 'OWNER'

  return (
    <PortalSection
      title="Vault"
      subtitle={
        isOwner
          ? 'Stored credentials. Owner mode: you can see private credentials owned by every member of this company.'
          : 'Stored credentials. Mark them private, share with your team, or share with PCC2K.'
      }
    >
      <VaultClient
        currentUserId={session.user.id}
        isOwner={isOwner}
      />
    </PortalSection>
  )
}
