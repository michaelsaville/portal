import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection from '@/app/components/PortalSection'
import { resolveActiveClientId, resolveDochubClientName } from '@/app/lib/portal-section'
import { ChatPanel } from './ChatPanel'

export const dynamic = 'force-dynamic'

interface Ticket {
  id: string
  ticketNumber: number
  title: string
  description: string | null
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

interface Comment {
  id: string
  body: string
  createdAt: string
  author: { name: string }
}

interface Attachment {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

interface DetailResponse {
  ok: boolean
  ticket: Ticket
  comments: Comment[]
  attachments: Attachment[]
  error?: string
}

function formatAbs(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
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
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? 'bg-stone-100 text-stone-700'}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  )
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect(`/login?next=/tickets/${id}`)

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) redirect('/tickets')
  const clientName = await resolveDochubClientName(activeClientId)

  let ticket: Ticket | null = null
  let comments: Comment[] = []
  let attachments: Attachment[] = []
  let error: string | null = null
  if (!clientName) {
    error = "Couldn't resolve client name."
  } else {
    try {
      const data = await signedPost<DetailResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/tickets/detail',
        { clientName, ticketId: id },
      )
      ticket = data.ticket
      comments = data.comments ?? []
      attachments = data.attachments ?? []
    } catch (err) {
      error = `Couldn't load ticket: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const subtitle = ticket
    ? `#${ticket.ticketNumber} · opened ${formatAbs(ticket.createdAt)}`
    : undefined

  return (
    <PortalSection
      title={ticket?.title ?? 'Ticket'}
      subtitle={subtitle}
      error={error}
      backHref="/tickets"
      backLabel="← all tickets"
      maxWidth="max-w-3xl"
    >
      {ticket && (
        <>
          <div className="mb-6 flex flex-wrap gap-2 text-xs text-stone-600">
            {statusBadge(ticket.status)}
            {ticket.site?.name && <span className="rounded-full bg-stone-100 px-2 py-0.5">{ticket.site.name}</span>}
            {ticket.assignedTo?.name && <span className="rounded-full bg-stone-100 px-2 py-0.5">assigned: {ticket.assignedTo.name}</span>}
          </div>

          {ticket.description && (
            <article className="mb-6 rounded-lg border border-stone-200 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-2">Original request</div>
              <div className="whitespace-pre-wrap text-sm text-stone-800">{ticket.description}</div>
            </article>
          )}

          {attachments.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">Attachments ({attachments.length})</h2>
              <div className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-200">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-stone-400">↓</span>
                      <span className="text-stone-800 truncate">{a.filename}</span>
                    </div>
                    <div className="text-xs text-stone-500 whitespace-nowrap">
                      {formatSize(a.sizeBytes)}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          <ChatPanel
            ticketId={ticket.id}
            initialComments={comments}
            initialStatus={ticket.status}
            initialAssignedTo={ticket.assignedTo}
            authorLabel={`${session.user.name} <${session.user.email}>`}
            isImpersonating={!!session.impersonatedStaffEmail}
          />
        </>
      )}
    </PortalSection>
  )
}
