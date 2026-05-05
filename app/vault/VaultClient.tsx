'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/app/components/ui/Button'
import { Card } from '@/app/components/ui/Card'
import { Select, Textarea, TextInput } from '@/app/components/ui/Input'
import { StatusBadge } from '@/app/components/ui/StatusBadge'

type Visibility = 'PRIVATE' | 'TEAM' | 'MSP_SHARED'

type VaultEntry = {
  id: string
  label: string
  username: string | null
  url: string | null
  notes: string | null
  hasTotp: boolean
  visibility: Visibility
  ownedByUserId: string | null
  createdByStaffId: string | null
  createdAt: string
  updatedAt: string
}

type Revealed = {
  password: string | null
  totpCode: string | null
  totpSecret: string | null
}

const EMPTY_FORM = {
  label: '',
  username: '',
  password: '',
  totp: '',
  url: '',
  notes: '',
  visibility: 'PRIVATE' as Visibility,
}

export function VaultClient({
  currentUserId,
  isOwner,
}: {
  currentUserId: string
  isOwner: boolean
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [items, setItems] = useState<VaultEntry[]>([])
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...EMPTY_FORM })
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM })
  const [filter, setFilter] = useState<'ALL' | Visibility>('ALL')
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [secLeft, setSecLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadSession()
  }, [])

  useEffect(() => {
    if (unlocked) loadItems()
  }, [unlocked])

  // TOTP boundary refresh — re-fetch reveal payloads on the 30s mark.
  useEffect(() => {
    refreshTimer.current = setInterval(() => {
      const s = 30 - (Math.floor(Date.now() / 1000) % 30)
      setSecLeft(s)
      if (s === 30) {
        Object.keys(revealed).forEach((id) => {
          if (revealed[id].totpSecret) refetchReveal(id)
        })
      }
    }, 1000)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])

  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function loadSession() {
    const r = await fetch('/api/portal/vault/session')
    if (r.ok) {
      const d = (await r.json()) as { unlocked: boolean; expiresAt?: string }
      setUnlocked(d.unlocked)
      setExpiresAt(d.expiresAt ?? null)
    }
  }

  async function loadItems() {
    const r = await fetch('/api/portal/vault')
    if (!r.ok) {
      flash('err', 'Could not load credentials')
      return
    }
    setItems((await r.json()) as VaultEntry[])
  }

  async function unlock() {
    if (!unlockPassword) {
      flash('err', 'Enter your portal password')
      return
    }
    setUnlocking(true)
    try {
      const r = await fetch('/api/portal/vault/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: unlockPassword }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        flash('err', (d as { error?: string }).error || 'Unlock failed')
        return
      }
      const d = (await r.json()) as { expiresAt: string }
      setUnlocked(true)
      setExpiresAt(d.expiresAt)
      setUnlockPassword('')
      flash('ok', 'Vault unlocked for 15 minutes')
    } finally {
      setUnlocking(false)
    }
  }

  async function lock() {
    await fetch('/api/portal/vault/session', { method: 'DELETE' })
    setUnlocked(false)
    setExpiresAt(null)
    setItems([])
    setRevealed({})
  }

  async function reveal(id: string) {
    const r = await fetch(`/api/portal/vault/${id}/reveal`)
    if (!r.ok) {
      flash('err', 'Could not reveal — vault may be locked')
      return
    }
    const d = (await r.json()) as Revealed
    setRevealed((p) => ({ ...p, [id]: d }))
  }

  async function refetchReveal(id: string) {
    const r = await fetch(`/api/portal/vault/${id}/reveal`)
    if (!r.ok) return
    const d = (await r.json()) as Revealed
    setRevealed((p) => ({ ...p, [id]: d }))
  }

  async function addItem() {
    if (!addForm.label.trim()) {
      flash('err', 'Label is required')
      return
    }
    const r = await fetch('/api/portal/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    if (!r.ok) {
      flash('err', 'Failed to add')
      return
    }
    setShowAdd(false)
    setAddForm({ ...EMPTY_FORM })
    loadItems()
    flash('ok', 'Added')
  }

  async function saveEdit(id: string) {
    const r = await fetch(`/api/portal/vault/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (!r.ok) {
      flash('err', 'Failed to save')
      return
    }
    setEditId(null)
    loadItems()
    flash('ok', 'Saved')
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this credential?')) return
    const r = await fetch(`/api/portal/vault/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      flash('err', 'Delete failed')
      return
    }
    setItems((p) => p.filter((x) => x.id !== id))
    setRevealed((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    flash('ok', 'Deleted')
  }

  function startEdit(item: VaultEntry) {
    setEditId(item.id)
    setEditForm({
      label: item.label,
      username: item.username ?? '',
      password: '',
      totp: '',
      url: item.url ?? '',
      notes: item.notes ?? '',
      visibility: item.visibility,
    })
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => flash('ok', `${label} copied`))
  }

  function canEdit(item: VaultEntry): boolean {
    if (item.ownedByUserId === currentUserId) return true
    if (isOwner) return true
    return false
  }

  const filtered = items.filter((i) => {
    if (filter !== 'ALL' && i.visibility !== filter) return false
    if (search) {
      const s = search.toLowerCase()
      if (
        !i.label.toLowerCase().includes(s) &&
        !(i.username ?? '').toLowerCase().includes(s) &&
        !(i.url ?? '').toLowerCase().includes(s)
      )
        return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-md px-4 py-2 text-sm shadow-lg ${
            msg.type === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Unlock card */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-stone-800">
              {unlocked ? 'Vault unlocked' : 'Vault locked'}
            </div>
            <div className="text-xs text-stone-500">
              {unlocked
                ? `Expires ${expiresAt ? new Date(expiresAt).toLocaleTimeString() : 'soon'}`
                : 'Re-enter your portal password to view stored credentials.'}
            </div>
          </div>
          {unlocked ? (
            <Button variant="secondary" onClick={lock}>
              Lock
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <TextInput
                type="password"
                placeholder="Portal password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && unlock()}
                wrapperClassName="w-56"
              />
              <Button onClick={unlock} disabled={unlocking}>
                {unlocking ? 'Unlocking…' : 'Unlock'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {unlocked && (
        <Card>
          {/* Search + filter + add */}
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <TextInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search credentials…"
              wrapperClassName="w-60"
            />
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'ALL' | Visibility)}
              wrapperClassName="w-48"
            >
              <option value="ALL">All credentials</option>
              <option value="PRIVATE">Private only</option>
              <option value="TEAM">Team only</option>
              <option value="MSP_SHARED">Shared with PCC2K</option>
            </Select>
            <div className="flex-1" />
            {!showAdd && (
              <Button onClick={() => setShowAdd(true)}>+ Add credential</Button>
            )}
          </div>

          {showAdd && (
            <Card tone="muted" padding="sm" className="mb-4">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-stone-500">
                New credential
              </div>
              <CredentialForm
                form={addForm}
                onChange={setAddForm}
                onSave={addItem}
                onCancel={() => {
                  setShowAdd(false)
                  setAddForm({ ...EMPTY_FORM })
                }}
                saveLabel="Add"
              />
            </Card>
          )}

          {filtered.length === 0 && (
            <Card dashed padding="lg" className="text-center">
              <p className="text-sm text-stone-500">
                {items.length === 0
                  ? 'No credentials yet — click + Add credential to get started.'
                  : 'Nothing matches your filter.'}
              </p>
            </Card>
          )}

          <ul className="divide-y divide-stone-200">
            {filtered.map((item) => {
              const editable = canEdit(item)
              const isMine = item.ownedByUserId === currentUserId
              return (
                <li key={item.id} className="py-3">
                  {editId === item.id ? (
                    <CredentialForm
                      form={editForm}
                      onChange={setEditForm}
                      onSave={() => saveEdit(item.id)}
                      onCancel={() => setEditId(null)}
                      saveLabel="Save"
                      passwordPlaceholder="Leave blank to keep"
                      totpPlaceholder="Leave blank to keep"
                    />
                  ) : (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-stone-800">
                            {item.label}
                          </span>
                          <StatusBadge status={item.visibility} kind="vault-visibility" />
                          {!isMine && item.ownedByUserId && (
                            <span className="text-[11px] text-stone-500">· shared</span>
                          )}
                        </div>
                        {editable && (
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => startEdit(item)}>
                              Edit
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => deleteItem(item.id)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </div>
                      {item.username && (
                        <div className="mt-0.5 text-xs text-stone-600">
                          {item.username}
                        </div>
                      )}
                      {item.url && (
                        <div className="mt-0.5 text-xs">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-700 hover:underline"
                          >
                            {item.url}
                          </a>
                        </div>
                      )}
                      {item.notes && (
                        <div className="mt-1 whitespace-pre-wrap text-xs text-stone-600">
                          {item.notes}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {!revealed[item.id] ? (
                          <Button variant="secondary" size="sm" onClick={() => reveal(item.id)}>
                            Reveal
                          </Button>
                        ) : (
                          <>
                            {revealed[item.id].password && (
                              <div className="flex items-center gap-2">
                                <code className="rounded bg-stone-100 px-2 py-0.5 font-mono text-xs">
                                  {revealed[item.id].password}
                                </code>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copy(revealed[item.id].password!, 'Password')
                                  }
                                  className="text-[11px] text-stone-500 hover:text-stone-800"
                                >
                                  copy
                                </button>
                              </div>
                            )}
                            {revealed[item.id].totpCode && (
                              <div className="flex items-center gap-2">
                                <code
                                  className={`rounded bg-stone-100 px-2 py-0.5 font-mono text-sm font-semibold tracking-widest ${
                                    secLeft <= 5 ? 'text-amber-600' : 'text-stone-800'
                                  }`}
                                >
                                  {revealed[item.id].totpCode}
                                </code>
                                <span
                                  className={`text-[11px] ${
                                    secLeft <= 5
                                      ? 'text-amber-600'
                                      : 'text-stone-500'
                                  }`}
                                >
                                  {secLeft}s
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copy(revealed[item.id].totpCode!, 'TOTP code')
                                  }
                                  className="text-[11px] text-stone-500 hover:text-stone-800"
                                >
                                  copy
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

interface FormProps {
  form: typeof EMPTY_FORM
  onChange: (next: typeof EMPTY_FORM) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
  passwordPlaceholder?: string
  totpPlaceholder?: string
}

function CredentialForm({
  form,
  onChange,
  onSave,
  onCancel,
  saveLabel,
  passwordPlaceholder = 'Password',
  totpPlaceholder = 'TOTP secret (base32, optional)',
}: FormProps) {
  const set = (patch: Partial<typeof EMPTY_FORM>) => onChange({ ...form, ...patch })
  return (
    <div className="flex flex-col gap-2">
      <TextInput
        placeholder="Label *"
        value={form.label}
        onChange={(e) => set({ label: e.target.value })}
      />
      <TextInput
        placeholder="Username"
        value={form.username}
        onChange={(e) => set({ username: e.target.value })}
      />
      <TextInput
        type="password"
        placeholder={passwordPlaceholder}
        value={form.password}
        onChange={(e) => set({ password: e.target.value })}
      />
      <TextInput
        placeholder={totpPlaceholder}
        value={form.totp}
        onChange={(e) => set({ totp: e.target.value })}
      />
      <TextInput
        placeholder="URL"
        value={form.url}
        onChange={(e) => set({ url: e.target.value })}
      />
      <Textarea
        placeholder="Notes"
        value={form.notes}
        onChange={(e) => set({ notes: e.target.value })}
        rows={2}
      />
      <Select
        value={form.visibility}
        onChange={(e) => set({ visibility: e.target.value as Visibility })}
      >
        <option value="PRIVATE">Private — only me</option>
        <option value="TEAM">Team — everyone in this company</option>
        <option value="MSP_SHARED">Shared with PCC2K</option>
      </Select>
      <div className="flex gap-2">
        <Button onClick={onSave}>{saveLabel}</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
