import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

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
  const now = Date.now()
  const days = Math.floor((now - d.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    NEW: 'bg-sky-100 text-sky-800',
    OPEN: 'bg-sky-100 text-sky-800',
    IN_PROGRESS: 'bg-amber-100 text-amber-800',
    WAITING: 'bg-violet-100 text-violet-800',
    WAITING_ON_CLIENT: 'bg-violet-100 text-violet-800',
    RESOLVED: 'bg-emerald-100 text-emerald-800',
    CLOSED: 'bg-stone-100 text-stone-600',
  }
  const cls = map[status] ?? 'bg-stone-100 text-stone-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  )
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

export default async function TicketsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/tickets')

  let activeClientId = session.activeClientId
  if (!activeClientId) {
    const link = await prisma.portalUserClientLink.findFirst({
      where: { portalUserId: session.user.id },
      select: { clientId: true },
      orderBy: { createdAt: 'asc' },
    })
    activeClientId = link?.clientId ?? null
  }

  if (!activeClientId) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-serif text-3xl font-bold text-stone-800">Tickets</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

  // PortalUserClientLink stores DocHub Client.id. TH matches TH_Client by
  // name, so we need to look up the name from DocHub's schema first. The
  // portal Prisma client only knows about the `portal` schema, but the
  // table lives in the same DB — a raw query gets us there without
  // touching the schema file or re-running db push.
  const nameRows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM public."Client" WHERE id = ${activeClientId} LIMIT 1
  `
  const clientName = nameRows[0]?.name ?? null

  let tickets: Ticket[] = []
  let error: string | null = null
  let tickethubClient: { id: string; name: string } | null = null

  if (!clientName) {
    error = "Couldn't resolve client name — tell PCC2K this link seems stale."
  } else {
    try {
      const data = await signedPost<TicketsResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/tickets',
        { clientName, limit: 50 },
      )
      tickets = data.tickets ?? []
      tickethubClient = data.client
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  const activeCount = tickets.filter((t) => !['CLOSED', 'RESOLVED'].includes(t.status)).length

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Tickets</h1>
            <p className="mt-1 text-sm text-stone-600">
              {tickets.length === 0 ? 'no tickets on record' : `${activeCount} open · ${tickets.length} most recent`}
            </p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load tickets: {error}
          </div>
        )}

        {!error && tickets.length === 0 && tickethubClient === null && clientName && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
            No TicketHub account matched <code>{clientName}</code> yet.
          </div>
        )}

        {!error && tickets.length === 0 && tickethubClient !== null && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
            No tickets on record. Email <a className="underline" href="mailto:hello@pcc2k.com">hello@pcc2k.com</a> to open one.
          </div>
        )}

        {tickets.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2 w-16">#</th>
                  <th className="px-4 py-2">Title</th>
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
                    <td className="px-4 py-2">
                      {statusBadge(t.status)}
                      {priorityBadge(t.priority)}
                    </td>
                    <td className="px-4 py-2 text-stone-700">{t.assignedTo?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-xs text-stone-500">
          Showing the {tickets.length > 0 ? `${tickets.length} most recent` : 'last 50'} tickets. Click a row to read the thread and reply.
        </p>
      </div>
    </main>
  )
}
