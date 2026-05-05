import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { resolveActiveClientId, resolveDochubClientName } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface Estimate {
  id: string
  estimateNumber: number
  title: string
  status: string
  totalAmount: number
  validUntil: string | null
  sentAt: string | null
  approvedAt: string | null
  declinedAt: string | null
  convertedAt: string | null
  createdAt: string
}

interface EstimatesResponse {
  ok: boolean
  client: { id: string; name: string } | null
  estimates: Estimate[]
  error?: string
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    SENT: 'bg-sky-100 text-sky-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    DECLINED: 'bg-stone-100 text-stone-600',
    EXPIRED: 'bg-amber-100 text-amber-800',
    CONVERTED: 'bg-violet-100 text-violet-800',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? 'bg-stone-100 text-stone-700'}`}>
      {status.toLowerCase()}
    </span>
  )
}

export default async function EstimatesPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/estimates')
  if (session.aggregateMode) return <AggregateNotSupported title="Estimates" />

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Estimates" />

  const clientName = await resolveDochubClientName(activeClientId)

  let estimates: Estimate[] = []
  let error: string | null = null
  if (!clientName) {
    error = "Couldn't resolve client name — tell PCC2K this link seems stale."
  } else {
    try {
      const data = await signedPost<EstimatesResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/estimates',
        { clientName },
      )
      estimates = data.estimates ?? []
    } catch (err) {
      error = `Couldn't load estimates: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const pending = estimates.filter((e) => e.status === 'SENT')
  const pendingTotal = pending.reduce((sum, e) => sum + e.totalAmount, 0)
  const subtitle = estimates.length === 0
    ? 'no estimates on record'
    : `${pending.length} awaiting your review (${money(pendingTotal)}) · ${estimates.length} total`

  return (
    <PortalSection title="Estimates" subtitle={subtitle} error={error}>
      {!error && estimates.length === 0 && <EmptyState>Nothing on record.</EmptyState>}

      {estimates.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-2 w-16">#</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Sent</th>
                <th className="px-4 py-2">Valid until</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {estimates.map((e) => (
                <tr key={e.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2 font-mono text-xs text-stone-500">
                    <Link href={`/estimates/${e.id}`} className="hover:text-stone-800">#{e.estimateNumber}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/estimates/${e.id}`} className="text-stone-800 hover:underline">{e.title}</Link>
                  </td>
                  <td className="px-4 py-2">{statusBadge(e.status)}</td>
                  <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(e.totalAmount)}</td>
                  <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(e.sentAt)}</td>
                  <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(e.validUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs text-stone-500">Click a sent estimate to review and approve or decline it.</p>
    </PortalSection>
  )
}
