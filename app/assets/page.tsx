import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import { resolveActiveClientId } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface Asset {
  id: string
  name: string
  friendlyName: string | null
  category: string
  status: string
  make: string | null
  model: string | null
  serial: string | null
  assetTag: string | null
  warrantyExpiry: string | null
  room: string | null
  location: { id: string; name: string }
}

interface AssetsResponse {
  ok: boolean
  assets: Asset[]
  error?: string
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function warrantyBadge(iso: string | null) {
  if (!iso) return null
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">expired {Math.abs(days)}d ago</span>
  }
  if (days <= 30) {
    return <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{days}d left</span>
  }
  return null
}

export default async function AssetsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/assets')

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Assets" />

  let assets: Asset[] = []
  let error: string | null = null
  try {
    const data = await signedPost<AssetsResponse>(
      process.env.DOCHUB_BFF_URL ?? '',
      '/api/bff/portal/dochub/assets',
      { clientId: activeClientId },
    )
    assets = data.assets ?? []
  } catch (err) {
    error = err instanceof Error ? `Couldn't load assets: ${err.message}` : `Couldn't load assets: ${String(err)}`
  }

  const byLocation = new Map<string, { name: string; items: Asset[] }>()
  for (const a of assets) {
    const entry = byLocation.get(a.location.id) ?? { name: a.location.name, items: [] as Asset[] }
    entry.items.push(a)
    byLocation.set(a.location.id, entry)
  }

  return (
    <PortalSection
      title="Assets"
      subtitle={`${assets.length} active asset${assets.length === 1 ? '' : 's'} on record`}
      error={error}
    >
      {!error && assets.length === 0 && (
        <EmptyState>Nothing on record yet. If that seems wrong, let us know.</EmptyState>
      )}

      {assets.length > 0 && (
        <div className="space-y-8">
          {Array.from(byLocation.values()).map((loc) => (
            <section key={loc.name}>
              <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">{loc.name}</h2>
              <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Make / Model</th>
                      <th className="px-4 py-2">Serial / Tag</th>
                      <th className="px-4 py-2">Warranty</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {loc.items.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2">
                          <div className="text-stone-800">{a.friendlyName ?? a.name}</div>
                          {a.room && <div className="text-xs text-stone-500">{a.room}</div>}
                        </td>
                        <td className="px-4 py-2 text-stone-700">{[a.make, a.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="px-4 py-2 text-xs text-stone-500 font-mono">{a.serial ?? a.assetTag ?? '—'}</td>
                        <td className="px-4 py-2 text-stone-700">
                          {formatDate(a.warrantyExpiry)}
                          {warrantyBadge(a.warrantyExpiry)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">{a.category}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </PortalSection>
  )
}
