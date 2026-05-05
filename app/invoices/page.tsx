import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import {
  resolveActiveClientId,
  resolveAllLinkedClientIds,
  resolveDochubClientName,
} from '@/app/lib/portal-section'
import { InvoicesTable } from './InvoicesTable'

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

async function fetchInvoicesForClient(clientId: string) {
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return {
      clientId,
      clientName: null,
      invoices: [] as Invoice[],
      balanceCents: 0,
      error: 'stale link',
    }
  }
  try {
    const data = await signedPost<InvoicesResponse>(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/invoices',
      { clientName },
    )
    return {
      clientId,
      clientName,
      invoices: data.invoices ?? [],
      balanceCents: data.balanceCents ?? 0,
      error: null as string | null,
    }
  } catch (err) {
    return {
      clientId,
      clientName,
      invoices: [] as Invoice[],
      balanceCents: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
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
  const isImpersonating = !!session.impersonatedStaffEmail

  // Phase 4 — aggregate fan-out across every linked client.
  if (session.aggregateMode) {
    const ids = await resolveAllLinkedClientIds(session)
    if (ids.length === 0) return <NotLinkedYet title="Invoices" />

    const results = await Promise.all(ids.map(fetchInvoicesForClient))
    const all = results.flatMap((r) =>
      r.invoices.map((inv) => ({ ...inv, _client: r.clientName ?? '—' })),
    )
    all.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
    const totalBalance = results.reduce((s, r) => s + r.balanceCents, 0)
    const errored = results.filter((r) => r.error).map((r) => r.clientName ?? r.clientId)
    const subtitle =
      totalBalance > 0
        ? `Aggregate · ${money(totalBalance)} outstanding across ${ids.length} companies`
        : all.length > 0
          ? `Aggregate · all paid up across ${ids.length} companies`
          : `no invoices on record across ${ids.length} companies`

    return (
      <PortalSection
        title="Invoices"
        subtitle={subtitle}
        error={
          errored.length > 0
            ? `Couldn't load invoices for: ${errored.join(', ')}`
            : null
        }
      >
        {all.length === 0 ? (
          <EmptyState>No invoices on record across any of your companies.</EmptyState>
        ) : (
          <InvoicesTable
            invoices={all}
            isImpersonating={isImpersonating}
            showCompany
            multiPayDisabled
          />
        )}
        <p className="mt-4 text-xs text-stone-500">
          Multi-pay across companies needs separate Stripe sessions; that's a
          later phase. For now, switch to a single company to multi-pay, or
          use the per-row Pay button below.
        </p>
      </PortalSection>
    )
  }

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Invoices" />

  const { clientName, invoices, balanceCents, error: fetchError } =
    await fetchInvoicesForClient(activeClientId)
  const error = !clientName
    ? "Couldn't resolve client name — tell PCC2K this link seems stale."
    : fetchError
      ? `Couldn't load invoices: ${fetchError}`
      : null

  const subtitle = balanceCents > 0
    ? `${money(balanceCents)} outstanding · ${invoices.length} recent`
    : invoices.length > 0
      ? `All paid up · ${invoices.length} recent`
      : 'no invoices on record'

  const paidInvoice = justPaidId
    ? invoices.find((i) => i.id === justPaidId)
    : null

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
        <InvoicesTable
          invoices={invoices.map((inv) => ({ ...inv, _client: clientName ?? '—' }))}
          isImpersonating={isImpersonating}
          showCompany={false}
        />
      )}

      <p className="mt-8 text-xs text-stone-500">
        Tick the boxes on any open invoices and use the bar at the bottom
        to pay several at once — your payment applies across them
        automatically. The "Pay this" button on a single row works the
        same way.
      </p>
    </PortalSection>
  )
}
