'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Comment = {
  id: string
  body: string
  createdAt: string
  author: { name: string }
}

type TicketSnapshot = {
  id: string
  status: string
  updatedAt: string
  assignedTo: { name: string } | null
}

type FetchedState = {
  ok: true
  ticket: TicketSnapshot
  comments: Comment[]
}

const ACTIVE_INTERVAL_MS = 6000
const IDLE_INTERVAL_MS = 30_000

const CLOSED_STATES = new Set(['CLOSED', 'RESOLVED', 'CANCELLED'])

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function stripPortalPrefix(body: string): { body: string; clientName: string | null } {
  const m = body.match(/^From: ([^\n]+) \(portal\)\n\n/)
  if (!m) return { body, clientName: null }
  return { body: body.slice(m[0].length), clientName: m[1] }
}

export function ChatPanel({
  ticketId,
  initialComments,
  initialStatus,
  initialAssignedTo,
  authorLabel,
  isImpersonating,
}: {
  ticketId: string
  initialComments: Comment[]
  initialStatus: string
  initialAssignedTo: { name: string } | null
  authorLabel: string
  isImpersonating: boolean
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [status, setStatus] = useState<string>(initialStatus)
  const [assignedTo, setAssignedTo] = useState<{ name: string } | null>(
    initialAssignedTo,
  )
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pollErr, setPollErr] = useState<string | null>(null)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef<number>(initialComments.length)
  const [hasFocus, setHasFocus] = useState(true)

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Initial scroll on mount.
  useEffect(() => {
    scrollToBottom(false)
  }, [scrollToBottom])

  // Auto-scroll only when new messages arrive AND user is already near bottom.
  useEffect(() => {
    if (comments.length > lastCountRef.current) {
      const el = scrollRef.current
      if (el) {
        const nearBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight < 120
        if (nearBottom) scrollToBottom(true)
      }
    }
    lastCountRef.current = comments.length
  }, [comments, scrollToBottom])

  // Visibility tracking — slow down polling when tab not active.
  useEffect(() => {
    function update() {
      setHasFocus(!document.hidden)
    }
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/chat/${ticketId}/messages`, {
        cache: 'no-store',
      })
      const data: FetchedState | { ok: false; error: string } = await res
        .json()
        .catch(() => ({ ok: false as const, error: 'parse error' }))
      if (!('ok' in data) || !data.ok) {
        setPollErr(
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'sync error',
        )
        return
      }
      setPollErr(null)
      setComments(data.comments)
      setStatus(data.ticket.status)
      setAssignedTo(data.ticket.assignedTo)
    } catch (err) {
      setPollErr(err instanceof Error ? err.message : 'network error')
    }
  }, [ticketId])

  // Polling loop.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      await poll()
      if (cancelled) return
      const interval = hasFocus ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS
      timer = setTimeout(tick, interval)
    }
    let timer: ReturnType<typeof setTimeout> = setTimeout(
      tick,
      hasFocus ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [poll, hasFocus])

  async function send() {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setSending(true)
    setSendErr(null)
    try {
      const res = await fetch(`/api/portal/chat/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setSendErr(data?.error ?? 'send failed')
      } else {
        setDraft('')
        await poll()
        scrollToBottom(true)
      }
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : 'network error')
    } finally {
      setSending(false)
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const isClosed = CLOSED_STATES.has(status)

  // Group consecutive same-author messages by day for date dividers.
  type Item =
    | { kind: 'day'; iso: string; key: string }
    | { kind: 'msg'; comment: Comment; isClient: boolean; displayName: string; key: string }

  const items: Item[] = []
  let lastDay: string | null = null
  for (const c of comments) {
    const day = new Date(c.createdAt).toDateString()
    if (day !== lastDay) {
      items.push({ kind: 'day', iso: c.createdAt, key: `day-${day}` })
      lastDay = day
    }
    const stripped = stripPortalPrefix(c.body)
    items.push({
      kind: 'msg',
      comment: { ...c, body: stripped.body },
      isClient: stripped.clientName !== null,
      displayName: stripped.clientName ?? c.author.name,
      key: c.id,
    })
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-2">
        <div className="text-xs font-medium uppercase tracking-wider text-stone-500">
          Chat
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          {assignedTo?.name ? (
            <span>with {assignedTo.name}</span>
          ) : (
            <span>awaiting tech</span>
          )}
          {pollErr && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
              {pollErr}
            </span>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="max-h-[60vh] min-h-[280px] space-y-3 overflow-y-auto bg-stone-50 p-4"
      >
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white p-6 text-center text-xs text-stone-500">
            No messages yet — say hi.
          </div>
        ) : (
          items.map((it) =>
            it.kind === 'day' ? (
              <div
                key={it.key}
                className="text-center text-[11px] uppercase tracking-wider text-stone-400"
              >
                {formatDay(it.iso)}
              </div>
            ) : (
              <div
                key={it.key}
                className={`flex flex-col ${it.isClient ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-1 text-[11px] text-stone-500">
                  {it.displayName} · {formatTime(it.comment.createdAt)}
                </div>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    it.isClient
                      ? 'rounded-br-sm bg-sky-600 text-white'
                      : 'rounded-bl-sm border border-stone-200 bg-white text-stone-800'
                  }`}
                >
                  {it.comment.body}
                </div>
              </div>
            ),
          )
        )}
      </div>

      {isImpersonating ? (
        <div className="border-t border-stone-200 bg-stone-50 p-4 text-xs text-stone-500">
          Staff impersonation is read-only — the customer can&apos;t see this
          tunnel and you can&apos;t reply from it.
        </div>
      ) : isClosed ? (
        <div className="border-t border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
          This ticket is{' '}
          <span className="font-medium">{status.toLowerCase()}</span>. Email{' '}
          <a className="underline" href="mailto:hello@pcc2k.com">
            hello@pcc2k.com
          </a>{' '}
          if you need to reopen it.
        </div>
      ) : (
        <div className="border-t border-stone-200 p-3">
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              maxLength={20_000}
              disabled={sending}
              placeholder="Type a message — Enter to send, Shift+Enter for newline"
              className="flex-1 resize-none rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              className="self-end rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500">
            <span>Posted as {authorLabel}</span>
            {sendErr && <span className="text-rose-600">{sendErr}</span>}
          </div>
        </div>
      )}
    </section>
  )
}
