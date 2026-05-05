import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import { StatusBadge } from '@/app/components/ui/StatusBadge'
import {
  resolveActiveClientId,
  resolveAllLinkedClientIds,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface Ticket {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  type: string
  board: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  site: { name: string } | null
  assignedTo: { name: string } | null
  contact: { firstName: string; lastName: string } | null
}

interface TicketsResponse {
  ok: boolean
  client: { id: string; name: string } | null
  tickets: Ticket[]
  error?: string
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function priorityBadge(priority: string) {
  if (priority === 'URGENT' || priority === 'HIGH') {
    return (
      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
        {priority.toLowerCase()}
      </span>
    )
  }
  return null
}

async function fetchTicketsForClient(clientId: string): Promise<{
  clientId: string
  clientName: string | null
  tickets: Ticket[]
  matched: boolean
  error: string | null
}> {
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return { clientId, clientName: null, tickets: [], matched: false, error: 'stale link' }
  }
  try {
    const data = await signedPost<TicketsResponse>(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/tickets',
      { clientName, limit: 50 },
    )
    return {
      clientId,
      clientName,
      tickets: data.tickets ?? [],
      matched: data.client !== null,
      error: null,
    }
  } catch (err) {
    return {
      clientId,
      clientName,
      tickets: [],
      matched: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export default async function TicketsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/tickets')

  // Phase 4 — aggregate fan-out across every linked client.
  if (session.aggregateMode) {
    const ids = await resolveAllLinkedClientIds(session)
    if (ids.length === 0) return <NotLinkedYet title="Tickets" />
    const results = await Promise.all(ids.map(fetchTicketsForClient))
    const all = results.flatMap((r) =>
      r.tickets.map((t) => ({ ...t, _client: r.clientName ?? '—' })),
    )
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const activeCount = all.filter((t) => !['CLOSED', 'RESOLVED'].includes(t.status)).length
    const errored = results.filter((r) => r.error).map((r) => r.clientName ?? r.clientId)
    const subtitle =
      all.length === 0
        ? `no tickets across ${ids.length} companies`
        : `Aggregate · ${activeCount} open · ${all.length} most recent across ${ids.length} companies`
    return (
      <PortalSection
        title="Tickets"
        subtitle={subtitle}
        error={
          errored.length > 0
            ? `Couldn't load tickets for: ${errored.join(', ')}`
            : null
        }
      >
        {all.length === 0 ? (
          <EmptyState>No tickets on record across any of your companies.</EmptyState>
        ) : (
          <TicketsTable
            tickets={all}
            showCompany
          />
        )}
        <p className="mt-8 text-xs text-stone-500">
          Aggregate view shows the {all.length} most recent tickets across every linked company. Click a row to read the thread and reply at that company.
        </p>
      </PortalSection>
    )
  }

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Tickets" />

  const { clientName, tickets, matched, error: fetchError } = await fetchTicketsForClient(activeClientId)
  const error = !clientName
    ? "Couldn't resolve client name — tell PCC2K this link seems stale."
    : fetchError
      ? `Couldn't load tickets: ${fetchError}`
      : null

  const activeCount = tickets.filter((t) => !['CLOSED', 'RESOLVED'].includes(t.status)).length
  const subtitle = tickets.length === 0 ? 'no tickets on record' : `${activeCount} open · ${tickets.length} most recent`

  return (
    <PortalSection title="Tickets" subtitle={subtitle} error={error}>
      {!error && tickets.length === 0 && !matched && clientName && (
        <EmptyState>No TicketHub account matched <code>{clientName}</code> yet.</EmptyState>
      )}

      {!error && tickets.length === 0 && matched && (
        <EmptyState>
          No tickets on record. Email <a className="underline" href="mailto:hello@pcc2k.com">hello@pcc2k.com</a> to open one.
        </EmptyState>
      )}

      {tickets.length > 0 && (
        <TicketsTable
          tickets={tickets.map((t) => ({ ...t, _client: clientName ?? '—' }))}
          showCompany={false}
        />
      )}

      <p className="mt-8 text-xs text-stone-500">
        Showing the {tickets.length > 0 ? `${tickets.length} most recent` : 'last 50'} tickets. Click a row to read the thread and reply.
      </p>
    </PortalSection>
  )
}

function TicketsTable({
  tickets,
  showCompany,
}: {
  tickets: (Ticket & { _client: string })[]
  showCompany: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
          <tr>
            <th className="px-4 py-2 w-16">#</th>
            <th className="px-4 py-2">Title</th>
            {showCompany && <th className="px-4 py-2">Company</th>}
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Assigned</th>
            <th className="px-4 py-2">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {tickets.map((t) => (
            <tr key={t.id} className="hover:bg-stone-50">
              <td className="px-4 py-2 font-mono text-xs text-stone-500">
                <Link href={`/tickets/${t.id}`} className="hover:text-stone-800">#{t.ticketNumber}</Link>
              </td>
              <td className="px-4 py-2">
                <Link href={`/tickets/${t.id}`} className="text-stone-800 hover:underline">{t.title}</Link>
                {(t.site?.name || t.contact) && (
                  <div className="text-xs text-stone-500">
                    {[t.site?.name, t.contact && `${t.contact.firstName} ${t.contact.lastName}`].filter(Boolean).join(' · ')}
                  </div>
                )}
              </td>
              {showCompany && (
                <td className="px-4 py-2 text-stone-700 whitespace-nowrap">{t._client}</td>
              )}
              <td className="px-4 py-2">
                <StatusBadge status={t.status} kind="ticket" />
                {priorityBadge(t.priority)}
              </td>
              <td className="px-4 py-2 text-stone-700">{t.assignedTo?.name ?? '—'}</td>
              <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(t.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
