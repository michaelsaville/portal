'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type ShareType = 'DOCUMENT' | 'ATTACHMENT' | 'PORTAL_CREDENTIAL'

interface GrantShare {
  id: string
  itemType: ShareType
  itemId: string
  note: string | null
  createdAt: string
  managedByClient: boolean
  label: string
}
interface Grant {
  id: string
  label: string | null
  vendor: { id: string; name: string }
  shares: GrantShare[]
}
interface Shareable {
  documents: Array<{ id: string; title: string; category: string | null }>
  files: Array<{ id: string; originalName: string; mimeType: string; detectedMime: string | null; size: number }>
  credentials: Array<{ id: string; label: string; username: string | null; url: string | null }>
}
interface ApiData {
  grants: Grant[]
  shareable: Shareable
}

const TYPE_LABEL: Record<ShareType, string> = {
  DOCUMENT: 'Document',
  ATTACHMENT: 'File',
  PORTAL_CREDENTIAL: 'Credential',
}

interface Candidate {
  itemType: ShareType
  itemId: string
  label: string
}

export function VendorAccessClient() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/portal/vendor-access', { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Failed to load (HTTP ${res.status})`)
      }
      setData((await res.json()) as ApiData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Every item the user is allowed to share, flattened to a common shape.
  const allCandidates = useMemo<Candidate[]>(() => {
    if (!data) return []
    return [
      ...data.shareable.documents.map((d) => ({ itemType: 'DOCUMENT' as const, itemId: d.id, label: d.title })),
      ...data.shareable.files.map((f) => ({ itemType: 'ATTACHMENT' as const, itemId: f.id, label: f.originalName })),
      ...data.shareable.credentials.map((c) => ({ itemType: 'PORTAL_CREDENTIAL' as const, itemId: c.id, label: c.label })),
    ]
  }, [data])

  async function addShare(grantId: string, itemType: ShareType, itemId: string) {
    setBusy(grantId)
    setError(null)
    try {
      const res = await fetch('/api/portal/vendor-access/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId, itemType, itemId }),
      })
      if (!res.ok && res.status !== 201) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not share')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share')
    } finally {
      setBusy(null)
    }
  }

  async function removeShare(grantId: string, shareId: string) {
    setBusy(grantId)
    setError(null)
    try {
      const res = await fetch('/api/portal/vendor-access/unshare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId, shareId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not remove')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {!data || data.grants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
          No vendors have been set up for your company yet. Ask PCC2K to add a
          vendor, then you can choose what they see here.
        </div>
      ) : (
        data.grants.map((grant) => (
          <GrantCard
            key={grant.id}
            grant={grant}
            candidates={allCandidates}
            busy={busy === grant.id}
            onAdd={addShare}
            onRemove={removeShare}
          />
        ))
      )}
    </div>
  )
}

function GrantCard({
  grant,
  candidates,
  busy,
  onAdd,
  onRemove,
}: {
  grant: Grant
  candidates: Candidate[]
  busy: boolean
  onAdd: (grantId: string, itemType: ShareType, itemId: string) => void
  onRemove: (grantId: string, shareId: string) => void
}) {
  const [picker, setPicker] = useState('')

  // Items not already shared in this grant (key = itemType + ':' + itemId).
  const sharedKeys = useMemo(
    () => new Set(grant.shares.map((s) => `${s.itemType}:${s.itemId}`)),
    [grant.shares],
  )
  const available = candidates.filter((c) => !sharedKeys.has(`${c.itemType}:${c.itemId}`))

  const byType = (t: ShareType) => available.filter((c) => c.itemType === t)

  function handlePick(value: string) {
    setPicker('')
    if (!value) return
    const [itemType, itemId] = value.split('::') as [ShareType, string]
    onAdd(grant.id, itemType, itemId)
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-stone-800">{grant.vendor.name}</div>
          {grant.label && <div className="text-xs text-stone-500">{grant.label}</div>}
        </div>
        <div className="text-xs text-stone-400">
          {grant.shares.length} item{grant.shares.length === 1 ? '' : 's'} shared
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {grant.shares.length === 0 && (
          <li className="text-sm text-stone-500">Nothing shared with this vendor yet.</li>
        )}
        {grant.shares.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-md border border-stone-100 bg-stone-50 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
                {TYPE_LABEL[s.itemType]}
              </span>
              <span className="truncate text-sm text-stone-800">{s.label}</span>
            </div>
            <button
              onClick={() => onRemove(grant.id, s.id)}
              disabled={busy}
              className="shrink-0 text-xs text-stone-400 hover:text-rose-600 disabled:opacity-50"
            >
              Stop sharing
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={picker}
          onChange={(e) => handlePick(e.target.value)}
          disabled={busy || available.length === 0}
          className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-700 disabled:opacity-50"
        >
          <option value="">
            {available.length === 0 ? 'Everything you can share is already shared' : '+ Share an item…'}
          </option>
          {(['DOCUMENT', 'ATTACHMENT', 'PORTAL_CREDENTIAL'] as ShareType[]).map((t) =>
            byType(t).length ? (
              <optgroup key={t} label={`${TYPE_LABEL[t]}s`}>
                {byType(t).map((c) => (
                  <option key={`${c.itemType}:${c.itemId}`} value={`${c.itemType}::${c.itemId}`}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        {busy && <span className="shrink-0 text-xs text-stone-400">saving…</span>}
      </div>
    </div>
  )
}
