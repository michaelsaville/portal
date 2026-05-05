import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { resolveActiveClientId } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface Domain {
  id: string
  domain: string
  label: string | null
  registrar: string | null
  expiresAt: string | null
  sslExpiresAt: string | null
  sslIssuer: string | null
  autoRenew: boolean
  isUp: boolean
  uptimeEnabled: boolean
}

interface DomainsResponse {
  ok: boolean
  domains: Domain[]
  error?: string
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function expiryBadge(iso: string | null) {
  if (!iso) return null
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">expired {Math.abs(days)}d ago</span>
  if (days <= 30) return <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{days}d left</span>
  return null
}

export default async function DomainsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/domains')
  if (session.aggregateMode) return <AggregateNotSupported title="Domains" />

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Domains" />

  let domains: Domain[] = []
  let error: string | null = null
  try {
    const data = await signedPost<DomainsResponse>(
      process.env.DOCHUB_BFF_URL ?? '',
      '/api/bff/portal/dochub/domains',
      { clientId: activeClientId },
    )
    domains = data.domains ?? []
  } catch (err) {
    error = `Couldn't load domains: ${err instanceof Error ? err.message : String(err)}`
  }

  return (
    <PortalSection
      title="Domains"
      subtitle={`${domains.length} domain${domains.length === 1 ? '' : 's'}`}
      error={error}
    >
      {!error && domains.length === 0 && <EmptyState>Nothing on record yet.</EmptyState>}

      {domains.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-2">Domain</th>
                <th className="px-4 py-2">Registrar</th>
                <th className="px-4 py-2">Domain renews</th>
                <th className="px-4 py-2">SSL expires</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {domains.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2">
                    <div className="text-stone-800">{d.domain}</div>
                    {d.label && <div className="text-xs text-stone-500">{d.label}</div>}
                  </td>
                  <td className="px-4 py-2 text-stone-700">
                    {d.registrar ?? '—'}
                    {d.autoRenew && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">auto-renew</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-700">
                    {formatDate(d.expiresAt)}
                    {expiryBadge(d.expiresAt)}
                  </td>
                  <td className="px-4 py-2 text-stone-700">
                    {formatDate(d.sslExpiresAt)}
                    {expiryBadge(d.sslExpiresAt)}
                  </td>
                  <td className="px-4 py-2">
                    {d.uptimeEnabled ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${d.isUp ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {d.isUp ? 'up' : 'down'}
                      </span>
                    ) : <span className="text-xs text-stone-400">—</span>}
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
