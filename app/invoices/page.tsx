import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import { resolveActiveClientId, resolveDochubClientName } from '@/app/lib/portal-section'

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
  stripePaymentLinkUrl: string | null
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

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login?next=/invoices')

  const params = await searchParams
  const justPaidId = params.paid ?? null

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Invoices" />

  const clientName = await resolveDochubClientName(activeClientId)

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
      error = `Couldn't load invoices: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const subtitle = balanceCents > 0
    ? `${money(balanceCents)} outstanding · ${invoices.length} recent`
    : invoices.length > 0
      ? `All paid up · ${invoices.length} recent`
      : 'no invoices on record'

  const paidInvoice = justPaidId
    ? invoices.find((i) => i.id === justPaidId)
    : null
  const isImpersonating = !!session.impersonatedStaffEmail

  return (
    <PortalSection title="Invoices" subtitle={subtitle} error={error}>
      {paidInvoice && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Payment received for invoice <strong>#{paidInvoice.invoiceNumber}</strong>. Thanks!
          {paidInvoice.status !== 'PAID' && (
            <span className="ml-1 text-emerald-700">It'll show as paid in the table below within a few seconds.</span>
          )}
        </div>
      )}

      {!error && invoices.length === 0 && <EmptyState>Nothing on record.</EmptyState>}

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
                <th className="px-4 py-2">PDF</th>
                <th className="px-4 py-2">Paid / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {invoices.map((i) => {
                const canPay = ['SENT', 'OVERDUE'].includes(i.status) && !!i.stripePaymentLinkUrl && !isImpersonating
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-2 font-mono text-xs text-stone-500">#{i.invoiceNumber}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(i.issueDate)}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(i.dueDate)}</td>
                    <td className="px-4 py-2">{statusBadge(i.status, i.dueDate)}</td>
                    <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(i.totalAmount)}</td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      <a
                        href={`/api/invoices/${i.id}/pdf`}
                        className="text-orange-600 hover:underline"
                      >
                        Download
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      {canPay ? (
                        <a
                          href={i.stripePaymentLinkUrl!}
                          className="inline-block rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600"
                        >
                          Pay now
                        </a>
                      ) : (
                        <span className="text-stone-500">{formatDate(i.paidAt)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs text-stone-500">
        Pay online with card or ACH — the link stays valid until the invoice is paid. The same link is in the invoice email; either works.
      </p>
    </PortalSection>
  )
}
