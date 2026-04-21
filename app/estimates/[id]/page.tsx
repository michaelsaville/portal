import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection from '@/app/components/PortalSection'
import { resolveActiveClientId, resolveDochubClientName } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface Item {
  id: string
  description: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  item: { name: string }
}

interface Estimate {
  id: string
  estimateNumber: number
  title: string
  description: string | null
  status: string
  subtotal: number
  taxAmount: number
  totalAmount: number
  validUntil: string | null
  sentAt: string | null
  approvedAt: string | null
  declinedAt: string | null
  convertedAt: string | null
  notes: string | null
  items: Item[]
}

interface DetailResponse {
  ok: boolean
  estimate: Estimate
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

async function actionOnEstimate(formData: FormData) {
  'use server'
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.impersonatedStaffEmail) return // staff tunnel is read-only

  const estimateId = String(formData.get('estimateId') ?? '')
  const action = String(formData.get('action') ?? '') as 'approve' | 'decline'
  const note = String(formData.get('note') ?? '').trim()
  if (!estimateId || (action !== 'approve' && action !== 'decline')) return

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return
  const clientName = await resolveDochubClientName(activeClientId)
  if (!clientName) return

  await signedPost(process.env.TICKETHUB_BFF_URL ?? '', '/api/bff/portal/tickethub/estimates/action', {
    clientName,
    estimateId,
    action,
    note: note || undefined,
    authorName: session.user.name,
    authorEmail: session.user.email,
  })

  revalidatePath(`/estimates/${estimateId}`)
  revalidatePath('/estimates')
}

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect(`/login?next=/estimates/${id}`)

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) redirect('/estimates')
  const clientName = await resolveDochubClientName(activeClientId)

  let estimate: Estimate | null = null
  let error: string | null = null
  if (!clientName) {
    error = "Couldn't resolve client name."
  } else {
    try {
      const data = await signedPost<DetailResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/estimates/detail',
        { clientName, estimateId: id },
      )
      estimate = data.estimate
    } catch (err) {
      error = `Couldn't load estimate: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const isActionable = estimate?.status === 'SENT'
  const subtitle = estimate
    ? `#${estimate.estimateNumber} · sent ${formatDate(estimate.sentAt)}`
    : undefined

  return (
    <PortalSection
      title={estimate?.title ?? 'Estimate'}
      subtitle={subtitle}
      error={error}
      backHref="/estimates"
      backLabel="← all estimates"
      maxWidth="max-w-3xl"
    >
      {estimate && (
        <>
          <div className="mb-6 flex flex-wrap gap-2 text-xs text-stone-600">
            {statusBadge(estimate.status)}
            {estimate.validUntil && <span className="text-stone-500">valid until {formatDate(estimate.validUntil)}</span>}
          </div>

          {estimate.description && (
            <article className="mb-6 rounded-lg border border-stone-200 bg-white p-4 whitespace-pre-wrap text-sm text-stone-800">
              {estimate.description}
            </article>
          )}

          <div className="mb-6 overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 w-20 text-right">Qty</th>
                  <th className="px-4 py-2 w-28 text-right">Unit</th>
                  <th className="px-4 py-2 w-28 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {estimate.items.map((it) => {
                  // For Syncro-imported rows the description is the real
                  // product/service name; it.item.name is a synthetic
                  // "Imported line item" placeholder. Prefer description
                  // when it's set so clients don't see a wall of identical
                  // item labels.
                  const primary = it.description ?? it.item.name
                  const secondary = it.description ? null : null
                  return (
                    <tr key={it.id}>
                      <td className="px-4 py-2">
                        <div className="text-stone-800 whitespace-pre-wrap">{primary}</div>
                        {secondary && <div className="text-xs text-stone-500">{secondary}</div>}
                      </td>
                      <td className="px-4 py-2 text-right text-stone-700">{it.quantity}</td>
                      <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(it.unitPrice)}</td>
                      <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(it.totalPrice)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-stone-50 text-sm">
                <tr>
                  <td className="px-4 py-2 text-right text-xs text-stone-500" colSpan={3}>Subtotal</td>
                  <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(estimate.subtotal)}</td>
                </tr>
                {estimate.taxAmount > 0 && (
                  <tr>
                    <td className="px-4 py-2 text-right text-xs text-stone-500" colSpan={3}>Tax</td>
                    <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(estimate.taxAmount)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2 text-right text-sm font-medium text-stone-800" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right text-base font-semibold text-stone-900 whitespace-nowrap">{money(estimate.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {isActionable ? (
            <form action={actionOnEstimate} className="rounded-lg border border-stone-200 bg-white p-4 space-y-3">
              <input type="hidden" name="estimateId" value={estimate.id} />
              <label className="block">
                <div className="text-xs font-medium text-stone-600 mb-1">Optional note</div>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={2000}
                  placeholder="Any comments or questions before you approve or decline…"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-stone-500">Decision records as {session.user.name} &lt;{session.user.email}&gt;</p>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    name="action"
                    value="decline"
                    className="rounded-md border border-stone-300 bg-white text-sm font-medium text-stone-700 px-4 py-2 hover:bg-stone-100"
                  >
                    Decline
                  </button>
                  <button
                    type="submit"
                    name="action"
                    value="approve"
                    className="rounded-md bg-emerald-700 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-800"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-stone-300 bg-stone-100 p-4 text-sm text-stone-600">
              {estimate.status === 'APPROVED' && <>Approved on {formatDate(estimate.approvedAt)}.</>}
              {estimate.status === 'DECLINED' && <>Declined on {formatDate(estimate.declinedAt)}.</>}
              {estimate.status === 'EXPIRED' && <>This estimate has expired. Email <a className="underline" href="mailto:hello@pcc2k.com">hello@pcc2k.com</a> if you&apos;d like it re-issued.</>}
              {estimate.status === 'CONVERTED' && <>This estimate was converted to an invoice on {formatDate(estimate.convertedAt)}.</>}
            </div>
          )}
        </>
      )}
    </PortalSection>
  )
}
