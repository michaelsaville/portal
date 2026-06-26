'use client'

import { useState } from 'react'

export interface SharedCredential {
  id: string
  kind: 'managed' | 'vault'
  label: string
  username: string | null
  url: string | null
  hasPassword: boolean
  hasTotp: boolean
}

type Revealed = { password: string | null; totpCode: string | null }

/**
 * Client-side credential list. Secrets are never sent to the browser until the
 * vendor clicks Reveal — that hits the portal's session-gated reveal proxy,
 * which asks DocHub to decrypt (and DocHub logs every reveal). The TOTP seed
 * is never returned, only the rotating 6-digit code.
 */
export function SharedCredentials({ clientId, credentials }: { clientId: string; credentials: SharedCredential[] }) {
  if (credentials.length === 0) {
    return <p className="text-sm text-stone-500">No credentials shared with you for this client.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {credentials.map((c) => (
        <CredentialRow key={c.id} clientId={clientId} cred={c} />
      ))}
    </ul>
  )
}

function CredentialRow({ clientId, cred }: { clientId: string; cred: SharedCredential }) {
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function reveal() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/vendor/shared/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, credentialId: cred.id, kind: cred.kind }),
      })
      const data = await res.json()
      if (res.ok && data.ok !== false) setRevealed({ password: data.password ?? null, totpCode: data.totpCode ?? null })
      else setError(data.error || 'Could not reveal')
    } catch {
      setError('Could not reveal')
    } finally { setLoading(false) }
  }

  async function copy(value: string, which: string) {
    try { await navigator.clipboard.writeText(value); setCopied(which); setTimeout(() => setCopied(null), 1500) } catch { /* clipboard blocked */ }
  }

  return (
    <li className="rounded-md border border-stone-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-stone-800">{cred.label}</div>
          {cred.username && (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-600">
              <span className="font-mono">{cred.username}</span>
              <button onClick={() => copy(cred.username!, 'user')} className="text-stone-400 hover:text-stone-700">
                {copied === 'user' ? 'copied' : 'copy'}
              </button>
            </div>
          )}
          {cred.url && (
            <a href={cred.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-xs text-sky-700 hover:underline">
              {cred.url}
            </a>
          )}
        </div>
        {cred.hasPassword && !revealed && (
          <button
            onClick={reveal}
            disabled={loading}
            className="shrink-0 rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            {loading ? 'Revealing…' : 'Reveal'}
          </button>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}

      {revealed && (
        <div className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3">
          {revealed.password != null && (
            <Field label="Password" value={revealed.password} mono onCopy={() => copy(revealed.password!, 'pw')} copied={copied === 'pw'} />
          )}
          {revealed.totpCode != null && (
            <Field label="2FA code" value={revealed.totpCode} mono onCopy={() => copy(revealed.totpCode!, 'totp')} copied={copied === 'totp'} hint="rotates every 30s — reveal again for a fresh code" />
          )}
          <button onClick={() => setRevealed(null)} className="self-start text-xs text-stone-400 hover:text-stone-700">Hide</button>
        </div>
      )}
    </li>
  )
}

function Field({ label, value, mono, onCopy, copied, hint }: { label: string; value: string; mono?: boolean; onCopy: () => void; copied: boolean; hint?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-stone-500">{label}</span>
        <span className={`flex-1 break-all text-sm text-stone-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
        <button onClick={onCopy} className="shrink-0 text-xs text-stone-400 hover:text-stone-700">{copied ? 'copied' : 'copy'}</button>
      </div>
      {hint && <div className="ml-22 pl-0 text-[11px] text-stone-400" style={{ marginLeft: '5.5rem' }}>{hint}</div>}
    </div>
  )
}
