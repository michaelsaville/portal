'use client'

import { useState } from 'react'

type Phase = 'idle' | 'starting' | 'launched' | 'error'

export function ConnectButton({
  deviceId,
  label,
  online,
  staffView,
}: {
  deviceId: string
  label: string
  online: boolean
  staffView: boolean
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  async function connect() {
    setPhase('starting')
    setMsg(null)
    try {
      const r = await fetch('/api/portal/remote/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      const j = (await r.json().catch(() => ({}))) as { deepLink?: string; error?: string }
      if (!r.ok || !j.deepLink) {
        setPhase('error')
        setMsg(j.error ?? `Couldn't start (HTTP ${r.status}).`)
        return
      }
      // Hand off to Breeze Viewer. Browsers give no signal when the app
      // isn't installed, so the "launched" state carries the install hint.
      window.location.href = j.deepLink
      setPhase('launched')
    } catch {
      setPhase('error')
      setMsg('Network error — check your connection and try again.')
    }
  }

  const disabled = staffView || !online || phase === 'starting'
  const title = staffView
    ? 'Staff view — the customer clicks this to connect'
    : online
      ? `Connect to ${label}`
      : `${label} is offline`

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={connect}
        disabled={disabled}
        title={title}
        className="rounded-md bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {phase === 'starting' ? 'Connecting…' : 'Connect'}
      </button>
      {staffView && (
        <span className="text-xs text-amber-800 sm:text-right">Disabled in staff view</span>
      )}
      {phase === 'launched' && (
        <span className="max-w-xs text-xs text-stone-600 sm:text-right">
          Breeze Viewer should open now. Nothing happened? Install Breeze Viewer (below), then click
          Connect again.
        </span>
      )}
      {phase === 'error' && msg && (
        <span role="alert" className="max-w-xs text-xs text-red-700 sm:text-right">
          {msg}
        </span>
      )}
    </div>
  )
}
