'use client'

import { useRef } from 'react'
import { switchClientAction } from '@/app/lib/actions/switch-client'

interface Props {
  links: { clientId: string; name: string; role: string }[]
  activeClientId: string
}

/**
 * Client-side form that submits a server action on select. Rendered in
 * the PortalSection chrome only when the user has multiple client
 * links. Single-link users see nothing — activeClientId is implicit.
 */
export default function ClientSwitcher({ links, activeClientId }: Props) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form action={switchClientAction} ref={formRef} className="inline-block">
      <label className="text-xs text-stone-500">
        <span className="sr-only">Viewing client</span>
        <select
          name="clientId"
          defaultValue={activeClientId}
          onChange={() => formRef.current?.requestSubmit()}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
        >
          {links.map((l) => (
            <option key={l.clientId} value={l.clientId}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  )
}
