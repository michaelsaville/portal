import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import { resolveActiveClientId } from '@/app/lib/portal-section'

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

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Contacts" />

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
    error = `Couldn't load contacts: ${err instanceof Error ? err.message : String(err)}`
  }

  return (
    <PortalSection
      title="Contacts"
      subtitle={`${contacts.length} active contact${contacts.length === 1 ? '' : 's'}`}
      error={error}
    >
      {!error && contacts.length === 0 && <EmptyState>Nothing on record yet.</EmptyState>}

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
                  <td className="px-4 py-2 text-stone-700">{c.jobTitle ?? c.role ?? '—'}</td>
                  <td className="px-4 py-2 text-stone-700">
                    {c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : '—'}
                  </td>
                  <td className="px-4 py-2 text-stone-700">
                    {c.phone || c.mobile ? (
                      <>
                        {c.phone && <div>{c.phone}</div>}
                        {c.mobile && <div className="text-xs text-stone-500">m: {c.mobile}</div>}
                      </>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalSection>
  )
}
