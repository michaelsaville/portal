'use client'

import { useEffect, useState } from 'react'

/**
 * Lightweight client component that fetches the pending-items count
 * after hydration and shows it as a small badge next to the Pending
 * sidebar link. Keeps server render fast — no extra BFF call per
 * page render.
 *
 * Listens for `portal:pending-changed` window events so /pending can
 * trigger a refresh after ack/snooze without a full page reload.
 */
export function PendingBadge() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/portal/reminders', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { reminders?: unknown[] }
        if (!cancelled) setCount(Array.isArray(data.reminders) ? data.reminders.length : 0)
      } catch {
        // ignore — badge stays hidden
      }
    }
    load()
    function onChanged() {
      load()
    }
    window.addEventListener('portal:pending-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('portal:pending-changed', onChanged)
    }
  }, [])

  if (count === null || count === 0) return null
  return (
    <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[10px] font-semibold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}
