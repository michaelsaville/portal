'use client'
import { useState } from 'react'

// Customer self-service remote access (2026-09-13). One click → FleetHub
// mints a device-scoped ControlR logon token → ControlR's viewer opens in
// a new tab already signed in as this portal user. Nothing to install.

export default function RemoteAccessButton({ deviceId, hostname, online }: { deviceId: string; hostname: string; online: boolean }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setErr(null)
    // Open the tab synchronously (popup blockers) and point it once we
    // have the URL.
    const w = window.open('about:blank', '_blank')
    try {
      const r = await fetch('/api/portal/fleet/remote-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!r.ok || !j.url) {
        w?.close()
        setErr(j.error ?? `Could not start (HTTP ${r.status})`)
        return
      }
      if (w) w.location.href = j.url
      else window.location.href = j.url
    } catch (e) {
      w?.close()
      setErr(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={busy || !online}
        title={online ? `Open a remote session to ${hostname}` : `${hostname} is offline`}
        className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Connecting…' : 'Remote access'}
      </button>
      {err && <span className="max-w-[220px] text-right text-[10.5px] text-red-600">{err}</span>}
    </div>
  )
}
