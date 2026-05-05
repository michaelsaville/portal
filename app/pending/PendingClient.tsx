'use client'

import { useCallback, useEffect, useState } from 'react'

interface ReminderData {
  id: string
  title: string
  body: string | null
  actionUrl: string | null
  source: string
  status: string
  recurrence: string
  dueDate: string | null
  nextNotifyAt: string
  notifyCount: number
  snoozedUntil: string | null
}

interface ListResponse {
  reminders: ReminderData[]
  unmapped?: boolean
  error?: string
}

const SOURCE_LABEL: Record<string, string> = {
  SYNCRO_ESTIMATE: 'Estimate',
  TICKETHUB_ESTIMATE: 'Estimate',
  MANUAL: 'Reminder',
}

const SOURCE_PILL: Record<string, string> = {
  SYNCRO_ESTIMATE: 'bg-sky-100 text-sky-800',
  TICKETHUB_ESTIMATE: 'bg-sky-100 text-sky-800',
  MANUAL: 'bg-stone-200 text-stone-700',
}

export function PendingClient() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unmapped, setUnmapped] = useState(false)
  const [reminders, setReminders] = useState<ReminderData[]>([])
  const [pendingAction, setPendingAction] = useState<Record<string, 'ack' | 'snooze' | null>>({})
  const [rowError, setRowError] = useState<Record<string, string | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/reminders', { cache: 'no-store' })
      if (!res.ok) {
        setError('Could not load pending items')
        return
      }
      const data = (await res.json()) as ListResponse
      if (data.error) {
        setError(data.error)
        return
      }
      setUnmapped(!!data.unmapped)
      setReminders(data.reminders ?? [])
    } catch {
      setError('Could not load pending items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(id: string, action: 'ack' | 'snooze') {
    setPendingAction((p) => ({ ...p, [id]: action }))
    setRowError((p) => ({ ...p, [id]: null }))
    try {
      const path =
        action === 'ack'
          ? `/api/portal/reminders/${id}/acknowledge`
          : `/api/portal/reminders/${id}/snooze`
      const res = await fetch(path, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRowError((p) => ({
          ...p,
          [id]: (body as { error?: string }).error || 'Action failed',
        }))
        return
      }
      // Optimistically remove from list and refresh badge after delay.
      setReminders((p) => p.filter((r) => r.id !== id))
      window.dispatchEvent(new CustomEvent('portal:pending-changed'))
    } catch {
      setRowError((p) => ({ ...p, [id]: 'Network error' }))
    } finally {
      setPendingAction((p) => ({ ...p, [id]: null }))
    }
  }

  if (loading) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
        Loading…
      </p>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p>{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded border border-rose-300 px-2 py-1 text-xs text-rose-800 hover:bg-rose-100"
        >
          Retry
        </button>
      </div>
    )
  }

  if (unmapped) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
        We haven't matched your portal account to a contact in our ticket
        system yet. PCC2K can set that up — once linked, your reminders and
        estimates will show here.
      </p>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-8 text-center text-sm text-emerald-800">
        All caught up — no pending items.
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {reminders.map((r) => {
        const action = pendingAction[r.id]
        const err = rowError[r.id]
        return (
          <li
            key={r.id}
            className="rounded-lg border border-stone-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${SOURCE_PILL[r.source] ?? 'bg-stone-200 text-stone-700'}`}
                  >
                    {SOURCE_LABEL[r.source] ?? r.source.replace(/_/g, ' ')}
                  </span>
                  <h3 className="text-sm font-medium text-stone-800">
                    {r.title}
                  </h3>
                  {r.status === 'SNOOZED' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-800">
                      Snoozed
                    </span>
                  )}
                </div>
                {r.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                    {r.body}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase text-stone-400">
                  {r.dueDate && (
                    <>
                      <span>due {new Date(r.dueDate).toLocaleDateString()}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{r.recurrence.replace(/_/g, ' ')}</span>
                  {r.notifyCount > 0 && (
                    <>
                      <span>·</span>
                      <span>sent {r.notifyCount}×</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {r.actionUrl && (
                <a
                  href={r.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
                >
                  View / Take action
                </a>
              )}
              <button
                type="button"
                onClick={() => act(r.id, 'ack')}
                disabled={!!action}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {action === 'ack' ? 'Marking…' : 'Acknowledged'}
              </button>
              <button
                type="button"
                onClick={() => act(r.id, 'snooze')}
                disabled={!!action}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {action === 'snooze' ? 'Snoozing…' : 'Snooze 3 days'}
              </button>
              {err && (
                <span className="text-xs text-rose-700">
                  {err} —{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => act(r.id, action ?? 'ack')}
                  >
                    retry
                  </button>
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
