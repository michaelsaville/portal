'use client'

import { useMemo, useState, useTransition } from 'react'

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
  /** Per-row company label; populated whether or not it's displayed. */
  _client?: string
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

function statusBadge(status: string, dueDate: string | null) {
  const map: Record<string, string> = {
    SENT: 'bg-sky-100 text-sky-800',
    VIEWED: 'bg-sky-100 text-sky-800',
    PAID: 'bg-emerald-100 text-emerald-800',
    OVERDUE: 'bg-red-100 text-red-700',
    VOID: 'bg-stone-100 text-stone-600',
  }
  let label = status.toLowerCase()
  let cls = map[status] ?? 'bg-stone-100 text-stone-700'
  if (
    status === 'SENT' &&
    dueDate &&
    new Date(dueDate).getTime() < Date.now()
  ) {
    label = 'past due'
    cls = map.OVERDUE
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  )
}

const PAYABLE_STATUSES = new Set(['SENT', 'VIEWED', 'OVERDUE'])

export function InvoicesTable({
  invoices,
  isImpersonating,
  showCompany = false,
  multiPayDisabled = false,
}: {
  invoices: Invoice[]
  isImpersonating: boolean
  /** Aggregate mode shows a "Company" column. */
  showCompany?: boolean
  /** Aggregate mode disables multi-pay (cross-company Stripe split is
   *  a later phase). Per-row "Pay this" still works. */
  multiPayDisabled?: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const payableInvoices = useMemo(
    () => invoices.filter((i) => PAYABLE_STATUSES.has(i.status)),
    [invoices],
  )
  const allPayableSelected =
    payableInvoices.length > 0 &&
    payableInvoices.every((i) => selected.has(i.id))
  const somePayableSelected =
    payableInvoices.some((i) => selected.has(i.id)) && !allPayableSelected

  const selectedTotal = invoices
    .filter((i) => selected.has(i.id))
    .reduce((s, i) => s + i.totalAmount, 0)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allPayableSelected) return new Set()
      return new Set(payableInvoices.map((i) => i.id))
    })
  }

  function payNow() {
    if (selected.size === 0 || isImpersonating) return
    setErr(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/invoices/multi-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds: Array.from(selected) }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.url) {
          setErr(data?.error ?? `Failed (${res.status})`)
          return
        }
        window.location.href = data.url
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Network error')
      }
    })
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-3 py-2 w-8">
                {!multiPayDisabled && (
                  <input
                    type="checkbox"
                    checked={allPayableSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePayableSelected
                    }}
                    disabled={
                      isImpersonating || payableInvoices.length === 0
                    }
                    onChange={toggleAll}
                    aria-label="Select all open invoices"
                    className="h-4 w-4 rounded border-stone-300"
                  />
                )}
              </th>
              <th className="px-4 py-2 w-16">#</th>
              {showCompany && <th className="px-4 py-2">Company</th>}
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
              const isPayable = PAYABLE_STATUSES.has(i.status)
              const checked = selected.has(i.id)
              const canPayThis =
                isPayable && !!i.stripePaymentLinkUrl && !isImpersonating
              return (
                <tr
                  key={i.id}
                  className={checked ? 'bg-orange-50/40' : ''}
                >
                  <td className="px-3 py-2">
                    {isPayable && !multiPayDisabled && (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isImpersonating}
                        onChange={() => toggle(i.id)}
                        aria-label={`Select invoice #${i.invoiceNumber}`}
                        className="h-4 w-4 rounded border-stone-300"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-stone-500">
                    #{i.invoiceNumber}
                  </td>
                  {showCompany && (
                    <td className="px-4 py-2 text-stone-700 whitespace-nowrap">
                      {i._client ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">
                    {formatDate(i.issueDate)}
                  </td>
                  <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">
                    {formatDate(i.dueDate)}
                  </td>
                  <td className="px-4 py-2">
                    {statusBadge(i.status, i.dueDate)}
                  </td>
                  <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">
                    {money(i.totalAmount)}
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap">
                    <a
                      href={`/api/invoices/${i.id}/pdf`}
                      className="text-orange-600 hover:underline"
                    >
                      Download
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap">
                    {canPayThis ? (
                      <a
                        href={i.stripePaymentLinkUrl!}
                        className="inline-block rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600"
                      >
                        Pay this
                      </a>
                    ) : (
                      <span className="text-stone-500">
                        {formatDate(i.paidAt)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky pay bar — only visible when at least one payable
          invoice is selected. Paying impersonation gets a hint
          instead of the live button. */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-orange-200 bg-orange-50/95 px-4 py-3 backdrop-blur shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            <span className="text-sm text-stone-700">
              <strong>{selected.size}</strong> selected ·{' '}
              <strong>{money(selectedTotal)}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-stone-500 hover:text-stone-700"
            >
              Clear
            </button>
            {err && (
              <span className="text-xs text-red-600">{err}</span>
            )}
            <div className="ml-auto">
              {isImpersonating ? (
                <span className="text-xs text-stone-500">
                  Pay disabled in staff impersonation
                </span>
              ) : (
                <button
                  type="button"
                  onClick={payNow}
                  disabled={isPending}
                  className="rounded-md bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {isPending
                    ? 'Preparing payment…'
                    : `Pay ${money(selectedTotal)} now`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
