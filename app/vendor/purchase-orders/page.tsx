import Link from 'next/link'
import { requireVendorSession } from '@/app/lib/vendor-context'
import { signedPost } from '@/app/lib/bff-client'
import { Card } from '@/app/components/ui/Card'
import { StatusBadge } from '@/app/components/ui/StatusBadge'

export const dynamic = 'force-dynamic'

interface POLine {
  id: string
  description: string
  quantity: number
  receivedQuantity: number
  unitCost: number
}

interface PO {
  id: string
  poNumber: number
  status: string
  externalRef: string | null
  notes: string | null
  sentAt: string | null
  expectedAt: string | null
  receivedAt: string | null
  totalCents: number
  lines: POLine[]
}

interface ListResponse {
  ok: boolean
  purchaseOrders?: PO[]
  error?: string
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function VendorPurchaseOrdersPage() {
  const ctx = await requireVendorSession()
  if (!ctx.activeVendor) {
    return (
      <div className="p-6 sm:p-10">
        <div className="max-w-5xl mx-auto">
          <header className="mb-6">
            <h1 className="font-serif text-3xl font-bold text-stone-800">
              Purchase orders
            </h1>
          </header>
          <Card tone="warning" padding="md">
            <p className="text-sm text-amber-900">
              Your account isn't linked to a vendor record yet — ask PCC2K to
              set that up.
            </p>
          </Card>
        </div>
      </div>
    )
  }

  let pos: PO[] = []
  let error: string | null = null
  try {
    const r = await signedPost<ListResponse>(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/vendor/purchase-orders',
      { vendorId: ctx.activeVendor.id },
    )
    pos = r.purchaseOrders ?? []
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load purchase orders'
  }

  return (
    <div className="p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Purchase orders
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {ctx.activeVendor.name} · {pos.length} on record
          </p>
        </header>

        {error && (
          <Card tone="danger" padding="md" className="mb-4">
            <p className="text-sm text-rose-800">{error}</p>
          </Card>
        )}

        {!error && pos.length === 0 && (
          <Card dashed padding="lg" className="text-center">
            <p className="text-sm text-stone-600">
              No purchase orders on record yet.
            </p>
          </Card>
        )}

        {pos.length > 0 && (
          <ul className="space-y-3">
            {pos.map((po) => (
              <li key={po.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-stone-700">
                          PO-{po.poNumber}
                        </span>
                        <StatusBadge status={po.status} />
                        {po.externalRef && (
                          <span className="text-[11px] text-stone-500">
                            ref: {po.externalRef}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-stone-400">
                        sent {fmtDate(po.sentAt)} · expected {fmtDate(po.expectedAt)}
                        {po.receivedAt && ' · received ' + fmtDate(po.receivedAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-stone-800">
                        {money(po.totalCents)}
                      </div>
                      <div className="text-[11px] text-stone-500">{po.lines.length} lines</div>
                    </div>
                  </div>

                  {po.lines.length > 0 && (
                    <ul className="mt-3 divide-y divide-stone-100 text-sm">
                      {po.lines.slice(0, 5).map((l) => (
                        <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                          <div className="min-w-0 flex-1 text-stone-700">{l.description}</div>
                          <div className="text-stone-500 text-xs">
                            {l.receivedQuantity}/{l.quantity} ·{' '}
                            <span className="font-mono">{money(l.unitCost)}</span>
                          </div>
                        </li>
                      ))}
                      {po.lines.length > 5 && (
                        <li className="py-1.5 text-xs text-stone-500">
                          + {po.lines.length - 5} more lines
                        </li>
                      )}
                    </ul>
                  )}

                  {po.notes && (
                    <p className="mt-3 whitespace-pre-wrap rounded-md bg-stone-50 p-2 text-xs text-stone-600">
                      {po.notes}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-xs text-stone-500">
          Read-only view for v1. Acceptance, partial-receive confirmation, and
          messaging on POs are coming soon. For now,{' '}
          <Link href="mailto:hello@pcc2k.com" className="underline">
            email PCC2K
          </Link>
          {' '}to acknowledge or update a PO.
        </p>
      </div>
    </div>
  )
}
