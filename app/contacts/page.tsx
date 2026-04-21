import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

export const dynamic = 'force-dynamic'

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  jobTitle: string | null
  role: string | null
  isPrimary: boolean
  isBilling: boolean
  isEscalation: boolean
}

interface ContactsResponse {
  ok: boolean
  contacts: Contact[]
  error?: string
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  const map: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-800',
    sky: 'bg-sky-100 text-sky-800',
    violet: 'bg-violet-100 text-violet-800',
  }
  return <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${map[color]}`}>{children}</span>
}

export default async function ContactsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/contacts')

  let activeClientId = session.activeClientId
  if (!activeClientId) {
    const link = await prisma.portalUserClientLink.findFirst({
      where: { portalUserId: session.user.id },
      select: { clientId: true },
      orderBy: { createdAt: 'asc' },
    })
    activeClientId = link?.clientId ?? null
  }

  if (!activeClientId) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-serif text-3xl font-bold text-stone-800">Contacts</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

  let contacts: Contact[] = []
  let error: string | null = null
  try {
    const data = await signedPost<ContactsResponse>(
      process.env.DOCHUB_BFF_URL ?? '',
      '/api/bff/portal/dochub/contacts',
      { clientId: activeClientId },
    )
    contacts = data.contacts ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Contacts</h1>
            <p className="mt-1 text-sm text-stone-600">{contacts.length} active contact{contacts.length === 1 ? '' : 's'}</p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load contacts: {error}
          </div>
        )}

        {!error && contacts.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">Nothing on record yet.</div>
        )}

        {contacts.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2">
                      <div className="text-stone-800">
                        {c.name}
                        {c.isPrimary && <Tag color="amber">Primary</Tag>}
                        {c.isBilling && <Tag color="sky">Billing</Tag>}
                        {c.isEscalation && <Tag color="violet">Escalation</Tag>}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-stone-700">
                      <div>{c.jobTitle ?? c.role ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-stone-700">
                      {c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : '—'}
                    </td>
                    <td className="px-4 py-2 text-stone-700">
                      {c.phone || c.mobile ? (
                        <>
                          {c.phone && <div>{c.phone}</div>}
                          {c.mobile && <div className="text-xs text-stone-500">m: {c.mobile}</div>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
