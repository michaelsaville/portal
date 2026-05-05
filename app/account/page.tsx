import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, {
  EmptyState,
  NotLinkedYet,
} from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface OpenInvoice {
  id: string
  invoiceNumber: number
  status: string
  issueDate: string
  dueDate: string | null
  totalAmount: number
  stripePaymentLinkUrl: string | null
}

interface RecentPayment {
  id: string
  invoiceNumber: number
  totalAmount: number
  paidAt: string | null
}

interface OverviewResponse {
  ok: boolean
  client: { id: string; name: string } | null
  balanceCents: number
  openInvoices: OpenInvoice[]
  recentPayments: RecentPayment[]
  aging: {
    current: number
    b30: number
    b60: number
    b90: number
    b90plus: number
  }
  payAllUrl: string | null
  error?: string
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function ageDays(issueIso: string, dueIso: string | null) {
  const anchor = new Date(dueIso ?? issueIso).getTime()
  return Math.max(
    0,
    Math.floor((Date.now() - anchor) / (24 * 60 * 60 * 1000)),
  )
}

export default async function AccountOverviewPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/account')
  if (session.aggregateMode) return <AggregateNotSupported title="Account" />

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Account" />
  const clientName = await resolveDochubClientName(activeClientId)

  let overview: OverviewResponse | null = null
  let error: string | null = null
  if (!clientName) {
    error =
      "Couldn't resolve client name — tell PCC2K this link seems stale."
  } else {
    try {
      overview = await signedPost<OverviewResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/account-overview',
        { clientName },
      )
    } catch (err) {
      error = `Couldn't load account overview: ${
        err instanceof Error ? err.message : String(err)
      }`
    }
  }

  const balance = overview?.balanceCents ?? 0
  const openInvoices = overview?.openInvoices ?? []
  const recentPayments = overview?.recentPayments ?? []
  const aging = overview?.aging ?? {
    current: 0,
    b30: 0,
    b60: 0,
    b90: 0,
    b90plus: 0,
  }
  const payAllUrl = overview?.payAllUrl ?? null
  const isImpersonating = !!session.impersonatedStaffEmail

  const subtitle =
    balance > 0
      ? `${money(balance)} outstanding · ${openInvoices.length} open ${
          openInvoices.length === 1 ? 'invoice' : 'invoices'
        }`
      : openInvoices.length === 0
        ? 'all paid up'
        : 'no balance due'

  return (
    <PortalSection title="Account" subtitle={subtitle} error={error}>
      {/* Balance + Pay-All hero */}
      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr,auto] items-center rounded-lg border border-stone-200 bg-white p-5">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-stone-500">
            Current Balance
          </div>
          <div className="mt-1 text-3xl font-bold text-stone-800">
            {money(balance)}
          </div>
          {balance === 0 && (
            <div className="mt-1 text-sm text-stone-500">
              Nothing due. Thanks!
            </div>
          )}
        </div>
        {balance > 0 && payAllUrl && !isImpersonating && (
          <a
            href={payAllUrl}
            className="inline-block rounded-md bg-orange-500 px-5 py-3 text-sm font-medium text-white hover:bg-orange-600"
          >
            Pay {money(balance)} now
          </a>
        )}
        {balance > 0 && !payAllUrl && (
          <span className="text-xs text-stone-500">
            Online payment temporarily unavailable.
          </span>
        )}
        {balance > 0 && isImpersonating && (
          <span className="text-xs text-stone-500">
            (Pay-All disabled in staff impersonation.)
          </span>
        )}
      </div>

      {/* Aging buckets — only when there's a balance. */}
      {balance > 0 && (
        <div className="mb-6">
          <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">
            Aging
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Bucket label="Current" cents={aging.current} />
            <Bucket label="1–30 days" cents={aging.b30} />
            <Bucket label="31–60 days" cents={aging.b60} highlight={aging.b60 > 0} />
            <Bucket label="61–90 days" cents={aging.b90} highlight={aging.b90 > 0} />
            <Bucket label="90+ days" cents={aging.b90plus} highlight={aging.b90plus > 0} />
          </div>
        </div>
      )}

      {/* Open invoices */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-mono uppercase tracking-wider text-stone-500">
            Open Invoices
          </div>
          <Link
            href="/invoices"
            className="text-xs text-orange-600 hover:underline"
          >
            View all →
          </Link>
        </div>
        {openInvoices.length === 0 ? (
          <EmptyState>No open invoices.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2 w-16">#</th>
                  <th className="px-4 py-2">Issued</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Days</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {openInvoices.map((i) => {
                  const days = ageDays(i.issueDate, i.dueDate)
                  const overdue = days > 0 && i.status !== 'PAID'
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-2 font-mono text-xs text-stone-500">
                        #{i.invoiceNumber}
                      </td>
                      <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">
                        {formatDate(i.issueDate)}
                      </td>
                      <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">
                        {formatDate(i.dueDate)}
                      </td>
                      <td
                        className={`px-4 py-2 text-xs whitespace-nowrap ${
                          overdue ? 'text-red-600 font-medium' : 'text-stone-500'
                        }`}
                      >
                        {days}
                      </td>
                      <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">
                        {money(i.totalAmount)}
                      </td>
                      <td className="px-4 py-2 text-xs whitespace-nowrap">
                        {i.stripePaymentLinkUrl && !isImpersonating ? (
                          <a
                            href={i.stripePaymentLinkUrl}
                            className="rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100"
                          >
                            Pay this
                          </a>
                        ) : (
                          <a
                            href={`/api/invoices/${i.id}/pdf`}
                            className="text-orange-600 hover:underline"
                          >
                            Download
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent payments */}
      <div>
        <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">
          Recent Payments
        </div>
        {recentPayments.length === 0 ? (
          <EmptyState>No payments on record yet.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2 w-16">#</th>
                  <th className="px-4 py-2">Paid</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-mono text-xs text-stone-500">
                      #{p.invoiceNumber}
                    </td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">
                      {formatDate(p.paidAt)}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700 whitespace-nowrap">
                      {money(p.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-stone-500">
        Pay online with card or ACH — your payment applies across the
        listed invoices automatically. Reach out if anything looks off.
      </p>
    </PortalSection>
  )
}

function Bucket({
  label,
  cents,
  highlight,
}: {
  label: string
  cents: number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? 'border-red-200 bg-red-50'
          : cents > 0
            ? 'border-stone-200 bg-white'
            : 'border-stone-200 bg-stone-50'
      }`}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-semibold ${
          highlight ? 'text-red-700' : 'text-stone-700'
        }`}
      >
        {money(cents)}
      </div>
    </div>
  )
}
