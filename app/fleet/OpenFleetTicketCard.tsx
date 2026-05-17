'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Phase 8 Workstream D step 6.2 — single-field "open a ticket" card
// on /fleet. Auto-attaches fleet context (device count, last report,
// open alerts) via the FleetHub BFF; portal-side proxy resolves the
// contact link.

export default function OpenFleetTicketCard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/portal/fleet/open-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ticketId?: string
        ticketNumber?: number
        error?: string
      }
      if (!res.ok || !j.ticketId) {
        setError(j.error ?? 'Could not open ticket')
        return
      }
      // Land on the new ticket so the customer sees their submission
      // reflected immediately.
      router.push(`/tickets/${j.ticketId}`)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
      >
        + Open a ticket
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-stone-300 bg-white p-4">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        Open a ticket
      </div>
      <p className="mb-3 text-xs text-stone-600">
        Tell us what&rsquo;s up. We&rsquo;ll attach your current device count,
        open-alert count, and most recent report automatically.
      </p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="e.g. The accounting laptop keeps freezing after the latest update — happened twice today."
        className="w-full resize-y rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-500 focus:outline-none"
        autoFocus
      />
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || description.trim().length < 10}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Opening…' : 'Open ticket'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setDescription('')
            setError(null)
          }}
          disabled={pending}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="ml-auto text-[10px] text-stone-400">
          {description.trim().length} / 4000
        </span>
      </div>
    </div>
  )
}
