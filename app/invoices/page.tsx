import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

export const dynamic = 'force-dynamic'

interface Invoice {
  id: string
  invoiceNumber: number
  status: string
  issueDate: string
  dueDate: string | null
  totalAmount: number
  sentAt: string | null
  paidAt: string | null
}

interface InvoicesResponse {
  ok: boolean
  client: { id: string; name: string } | null
  invoices: Invoice[]
  balanceCents: number
  error?: string
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(status: string, dueDate: string | null) {
  const map: Record<string, string> = {
    SENT: 'bg-sky-100 text-sky-800',
    PAID: 'bg-emerald-100 text-emerald-800',
    OVERDUE: 'bg-red-100 text-red-700',
    VOID: 'bg-stone-100 text-stone-600',
  }
  let label = status.toLowerCase()
  let cls = map[status] ?? 'bg-stone-100 text-stone-700'
  if (status === 'SENT' && dueDate && new Date(dueDate).getTime() < Date.now()) {
    label = 'past due'
    cls = map.OVERDUE
  }
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

export default async function InvoicesPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/invoices')

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
          <h1 className="font-serif text-3xl font-bold text-stone-800">Invoices</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

  const nameRows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM public."Client" WHERE id = ${activeClientId} LIMIT 1
  `
  const clientName = nameRows[0]?.name ?? null

  let invoices: Invoice[] = []
  let balanceCents = 0
  let error: string | null = null
  if (!clientName) {
    error = "Couldn't resolve client name — tell PCC2K this link seems stale."
  } else {
    try {
      const data = await signedPost<InvoicesResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/invoices',
        { clientName },
      )
      invoices = data.invoices ?? []
      balanceCents = data.balanceCents ?? 0
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Invoices</h1>
            <p className="mt-1 text-sm text-stone-600">
              {balanceCents > 0
                ? `${money(balanceCents)} outstanding · ${invoices.length} recent`
                : invoices.length > 0
                  ? `All paid up · ${invoices.length} recent`
                  : 'no invoices on record'}
            </p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load invoices: {error}
          </div>
        )}

        {!error && invoices.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
            Nothing on record.
          </div>
        )}

        {invoices.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2 w-16">#</th>
                  <th className="px-4 py-2">Issued</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2 font-mono text-xs text-stone-500">#{i.invoiceNumber}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(i.issueDate)}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(i.dueDate)}</td>
                    <td className="px-4 py-2">{statusBadge(i.status, i.dueDate)}</td>
                    <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(i.totalAmount)}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(i.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-xs text-stone-500">
          Pay-in-portal is on the roadmap. Until then, use the link in the invoice email.
        </p>
      </div>
    </main>
  )
}
