import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import PortalSection, { NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { PendingClient } from './PendingClient'

export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/pending')
  if (session.aggregateMode) return <AggregateNotSupported title="Pending" />
  if (!session.activeClientId) {
    return <NotLinkedYet title="Pending" />
  }
  return (
    <PortalSection
      title="Pending"
      subtitle="Items waiting on a response from you — estimates to approve, reminders to acknowledge."
    >
      <PendingClient />
    </PortalSection>
  )
}
