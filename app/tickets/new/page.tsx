import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { resolveActiveClientId } from '@/app/lib/portal-section'
import PortalSection, { NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { Card } from '@/app/components/ui/Card'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'

export default async function NewTicketPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/tickets/new')
  if (session.aggregateMode) {
    return <AggregateNotSupported title="New ticket" />
  }
  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="New ticket" />

  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId: activeClientId },
    select: { tickethubContactId: true },
  })

  if (!link?.tickethubContactId) {
    return (
      <PortalSection
        title="New ticket"
        subtitle="Your portal account isn't linked to a ticket-system contact yet."
        backHref="/tickets"
        backLabel="← back to tickets"
      >
        <Card dashed padding="lg" className="text-center">
          <p className="text-sm text-stone-600">
            PCC2K needs to link your portal account to a contact in our ticket
            system before you can open a ticket here. Email{' '}
            <a className="underline" href="mailto:hello@pcc2k.com">
              hello@pcc2k.com
            </a>{' '}
            and we'll set that up.
          </p>
        </Card>
      </PortalSection>
    )
  }

  if (session.impersonatedStaffEmail) {
    return (
      <PortalSection
        title="New ticket"
        subtitle="Read-only — staff tunnel cannot open tickets."
        backHref="/tickets"
        backLabel="← back to tickets"
      >
        <Card dashed padding="lg" tone="warning" className="text-center">
          <p className="text-sm text-amber-800">
            You're viewing as the client. Open the ticket inside TicketHub
            instead — this surface is read-only.
          </p>
        </Card>
      </PortalSection>
    )
  }

  return (
    <PortalSection
      title="New ticket"
      subtitle="Tell us what's wrong and we'll get someone on it."
      backHref="/tickets"
      backLabel="← back to tickets"
    >
      <NewTicketForm />
    </PortalSection>
  )
}
