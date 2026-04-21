import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection from '@/app/components/PortalSection'
import { resolveActiveClientId, resolveDochubClientName } from '@/app/lib/portal-section'

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

function stripPortalPrefix(body: string): { body: string; prefix: string | null } {
  const m = body.match(/^From: ([^\n]+) \(portal\)\n\n/)
  if (!m) return { body, prefix: null }
  return { body: body.slice(m[0].length), prefix: m[1] }
}

async function replyAction(formData: FormData) {
  'use server'
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.impersonatedStaffEmail) return // staff tunnel is read-only
  const ticketId = String(formData.get('ticketId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!ticketId || !body) return

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return
  const clientName = await resolveDochubClientName(activeClientId)
  if (!clientName) return

  await signedPost(process.env.TICKETHUB_BFF_URL ?? '', '/api/bff/portal/tickethub/tickets/reply', {
    clientName,
    ticketId,
    body,
    authorName: session.user.name,
    authorEmail: session.user.email,
    clientOpId: `portal:${session.user.id}:${Date.now()}`,
  })

  revalidatePath(`/tickets/${ticketId}`)
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

  const isClosed = ticket && ['CLOSED', 'RESOLVED'].includes(ticket.status)
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

          <section className="space-y-3 mb-6">
            {comments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-xs text-stone-500">
                No replies yet.
              </div>
            ) : (
              comments.map((c) => {
                const stripped = stripPortalPrefix(c.body)
                const displayAuthor = stripped.prefix ?? c.author.name
                const isClient = !!stripped.prefix
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-4 ${isClient ? 'border-sky-200 bg-sky-50' : 'border-stone-200 bg-white'}`}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <div className="text-sm font-medium text-stone-800">
                        {displayAuthor}
                        {isClient && <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-700">client</span>}
                      </div>
                      <div className="text-xs text-stone-500 whitespace-nowrap">{formatAbs(c.createdAt)}</div>
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-stone-800">{stripped.body}</div>
                  </div>
                )
              })
            )}
          </section>

          {isClosed ? (
            <div className="rounded-lg border border-stone-300 bg-stone-100 p-4 text-sm text-stone-600">
              This ticket is {ticket.status.toLowerCase()}. Email <a className="underline" href="mailto:hello@pcc2k.com">hello@pcc2k.com</a> if you need to reopen it.
            </div>
          ) : (
            <form action={replyAction} className="rounded-lg border border-stone-200 bg-white p-4">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label className="block">
                <div className="text-xs font-medium text-stone-600 mb-1">Reply to this ticket</div>
                <textarea
                  name="body"
                  rows={5}
                  maxLength={20_000}
                  required
                  placeholder="Type your reply…"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-stone-500">
                  Posted as {session.user.name} &lt;{session.user.email}&gt;
                </p>
                <button
                  type="submit"
                  className="rounded-md bg-stone-800 text-white text-sm font-medium px-4 py-2 hover:bg-stone-700"
                >
                  Send reply
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </PortalSection>
  )
}
