'use client'

import { useEffect, useRef, useState } from 'react'
import { switchClientAction } from '@/app/lib/actions/switch-client'
import { AGGREGATE_SENTINEL } from '@/app/lib/aggregate'
import { clientAbbrev, clientTint } from '@/app/lib/client-tint'

interface Props {
  links: { clientId: string; name: string; role: string }[]
  activeClientId: string
  aggregateActive: boolean
  aggregateEligible: boolean
}

/**
 * Slack-style company switcher. The visible chip-tile (abbrev + name +
 * role) is the trigger; click reveals a popover listing every link the
 * user has, with an optional "All companies" pseudo-row at the bottom
 * when the user is eligible for aggregate mode.
 *
 * Single-link non-eligible users see a static chip with no chevron.
 * Activates the underlying server action on selection.
 */
export default function CompanySwitcher({
  links,
  activeClientId,
  aggregateActive,
  aggregateEligible,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const idInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const active = links.find((l) => l.clientId === activeClientId) ?? links[0]
  if (!active) return null

  function pickClient(clientId: string) {
    if (!idInputRef.current || !formRef.current) return
    idInputRef.current.value = clientId
    formRef.current.requestSubmit()
    setOpen(false)
  }

  const multi = links.length > 1
  const showPopover = multi || aggregateEligible
  const tint = clientTint(active.clientId)
  const abbrev = clientAbbrev(active.name)

  return (
    <div ref={wrapRef} className="relative">
      <form ref={formRef} action={switchClientAction} className="hidden">
        <input
          ref={idInputRef}
          type="hidden"
          name="clientId"
          defaultValue={aggregateActive ? AGGREGATE_SENTINEL : active.clientId}
        />
      </form>

      <button
        type="button"
        onClick={() => showPopover && setOpen((v) => !v)}
        disabled={!showPopover}
        className="flex w-full items-center gap-2 rounded-md border border-stone-200 bg-white p-2 text-left transition-colors hover:bg-stone-50 disabled:cursor-default disabled:hover:bg-white"
      >
        {aggregateActive ? (
          <span
            aria-hidden
            className="inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md border-2 border-dashed border-stone-400 bg-stone-100 px-1.5 font-mono text-xs font-semibold text-stone-700"
          >
            ALL
          </span>
        ) : (
          <span
            className={`inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold ring-1 ${tint.bg} ${tint.text} ${tint.ring}`}
          >
            {abbrev}
          </span>
        )}
        <span className="min-w-0 flex-1">
          {aggregateActive ? (
            <>
              <span className="block truncate text-sm font-medium text-stone-800">
                All companies
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-stone-500">
                {links.length} companies
              </span>
            </>
          ) : (
            <>
              <span className="block truncate text-sm font-medium text-stone-800">
                {active.name}
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-stone-500">
                {active.role}
              </span>
            </>
          )}
        </span>
        {showPopover && (
          <span className="text-stone-400" aria-hidden>
            {open ? '▴' : '▾'}
          </span>
        )}
      </button>

      {open && showPopover && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg">
          <ul role="listbox" className="max-h-72 overflow-auto py-1">
            {links.map((l) => {
              const lt = clientTint(l.clientId)
              const ab = clientAbbrev(l.name)
              const isActive = !aggregateActive && l.clientId === active.clientId
              return (
                <li key={l.clientId}>
                  <button
                    type="button"
                    onClick={() => pickClient(l.clientId)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-stone-50 ${
                      isActive ? 'bg-stone-50' : ''
                    }`}
                    aria-selected={isActive}
                  >
                    <span
                      className={`inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded px-1 font-mono text-[10px] font-semibold ring-1 ${lt.bg} ${lt.text} ${lt.ring}`}
                    >
                      {ab}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-stone-800">{l.name}</span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400">
                      {l.role}
                    </span>
                    {isActive && (
                      <span className="text-stone-400" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              )
            })}

            {aggregateEligible && (
              <>
                <li className="my-1 border-t border-stone-100" aria-hidden />
                <li>
                  <button
                    type="button"
                    onClick={() => pickClient(AGGREGATE_SENTINEL)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-stone-50 ${
                      aggregateActive ? 'bg-stone-50' : ''
                    }`}
                    aria-selected={aggregateActive}
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded border-2 border-dashed border-stone-400 bg-stone-100 px-1 font-mono text-[10px] font-semibold text-stone-700"
                    >
                      ALL
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-stone-800">
                        All companies
                      </span>
                      <span className="block font-mono text-[10px] uppercase tracking-wider text-stone-500">
                        Tickets + invoices · {links.length} companies
                      </span>
                    </span>
                    {aggregateActive && (
                      <span className="text-stone-400" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
