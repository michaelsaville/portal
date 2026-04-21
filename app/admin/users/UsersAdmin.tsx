'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  inviteUser,
  updateLinkRole,
  setUserActive,
  removeLink,
} from '@/app/lib/actions/portal-users'

interface Client {
  id: string
  name: string
}

interface Link {
  id: string
  clientId: string
  clientName: string
  role: string
}

interface User {
  id: string
  email: string
  name: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  links: Link[]
}

interface Props {
  users: User[]
  clients: Client[]
  roles: string[]
}

export function UsersAdmin({ users, clients, roles }: Props) {
  const [tab, setTab] = useState<'list' | 'invite'>('list')

  return (
    <>
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('list')}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === 'list' ? 'bg-stone-800 text-white' : 'bg-white border border-stone-300 hover:bg-stone-100'}`}
        >
          Users ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('invite')}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === 'invite' ? 'bg-stone-800 text-white' : 'bg-white border border-stone-300 hover:bg-stone-100'}`}
        >
          + Invite user
        </button>
      </div>

      {tab === 'invite' ? (
        <InviteForm clients={clients} roles={roles} onDone={() => setTab('list')} />
      ) : (
        <UserTable users={users} roles={roles} />
      )}
    </>
  )
}

function InviteForm({
  clients,
  roles,
  onDone,
}: {
  clients: Client[]
  roles: string[]
  onDone: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [role, setRole] = useState('USER')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    startTransition(async () => {
      const res = await inviteUser({ email, name, clientId, role })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setInviteLink(res.data?.inviteLink ?? null)
      router.refresh()
    })
  }

  if (inviteLink) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 space-y-3 max-w-2xl">
        <h2 className="font-semibold text-stone-800">Invite sent</h2>
        <p className="text-sm text-stone-600">
          Email delivery isn&apos;t wired yet. Copy this link and send it
          yourself — it&apos;s good for 2 days and will let them set a
          password + sign in.
        </p>
        <textarea
          readOnly
          value={inviteLink}
          onFocus={(e) => e.currentTarget.select()}
          rows={2}
          className="w-full rounded-md border border-stone-300 bg-stone-50 p-2 font-mono text-xs text-stone-800"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setInviteLink(null)
              setEmail('')
              setName('')
            }}
            className="rounded-md bg-stone-800 text-white text-sm px-3 py-1.5 hover:bg-stone-700"
          >
            Invite another
          </button>
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-stone-600 hover:text-stone-800"
          >
            back to list
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-stone-200 bg-white p-6 space-y-3 max-w-2xl"
    >
      <h2 className="font-semibold text-stone-800">Invite a new user</h2>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          >
            {clients.length === 0 && <option value="">— no clients —</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {err}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending || !email || !name || !clientId}
          className="rounded-md bg-stone-800 text-white text-sm font-medium px-4 py-2 hover:bg-stone-700 disabled:opacity-50"
        >
          {isPending ? 'Inviting…' : 'Create invite'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-stone-600 hover:text-stone-800"
        >
          cancel
        </button>
      </div>
    </form>
  )
}

function UserTable({ users, roles }: { users: User[]; roles: string[] }) {
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
        No portal users yet — invite your first one above.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
          <tr>
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">Clients &amp; roles</th>
            <th className="px-4 py-2 w-24">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {users.map((u) => (
            <UserRow key={u.id} user={u} roles={roles} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UserRow({ user, roles }: { user: User; roles: string[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function changeRole(linkId: string, role: string) {
    setErr(null)
    startTransition(async () => {
      const res = await updateLinkRole({ linkId, role })
      if (!res.ok) setErr(res.error)
      router.refresh()
    })
  }

  function toggleActive() {
    setErr(null)
    startTransition(async () => {
      const res = await setUserActive({
        portalUserId: user.id,
        isActive: !user.isActive,
      })
      if (!res.ok) setErr(res.error)
      router.refresh()
    })
  }

  function drop(linkId: string) {
    if (!confirm('Remove this client link?')) return
    setErr(null)
    startTransition(async () => {
      const res = await removeLink({ linkId })
      if (!res.ok) setErr(res.error)
      router.refresh()
    })
  }

  return (
    <tr className={user.isActive ? '' : 'opacity-50'}>
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-stone-800">{user.name}</div>
        <div className="text-xs text-stone-500">{user.email}</div>
        <div className="mt-1 text-[10px] text-stone-400">
          Last login:{' '}
          {user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleString()
            : 'never'}
        </div>
        {err && (
          <div className="mt-1 text-xs text-red-700">{err}</div>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        {user.links.length === 0 ? (
          <span className="text-xs italic text-stone-400">
            no client links
          </span>
        ) : (
          <ul className="space-y-1.5">
            {user.links.map((l) => (
              <li key={l.id} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-stone-800">{l.clientName}</span>
                <select
                  value={l.role}
                  onChange={(e) => changeRole(l.id, e.target.value)}
                  disabled={isPending}
                  className="rounded border border-stone-300 px-1.5 py-0.5 text-xs"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => drop(l.id)}
                  disabled={isPending}
                  className="text-xs text-red-700 hover:text-red-900"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          className={`rounded px-2 py-0.5 text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}
        >
          {user.isActive ? 'Active' : 'Inactive'}
        </button>
      </td>
    </tr>
  )
}
