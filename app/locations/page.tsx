import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { resolveActiveClientId } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface Location {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  ispName: string | null
}

interface LocationsResponse {
  ok: boolean
  locations: Location[]
  error?: string
}

export default async function LocationsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/locations')
  if (session.aggregateMode) return <AggregateNotSupported title="Locations" />

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return <NotLinkedYet title="Locations" />

  let locations: Location[] = []
  let error: string | null = null
  try {
    const data = await signedPost<LocationsResponse>(
      process.env.DOCHUB_BFF_URL ?? '',
      '/api/bff/portal/dochub/locations',
      { clientId: activeClientId },
    )
    locations = data.locations ?? []
  } catch (err) {
    error = `Couldn't load locations: ${err instanceof Error ? err.message : String(err)}`
  }

  return (
    <PortalSection
      title="Locations"
      subtitle={`${locations.length} location${locations.length === 1 ? '' : 's'}`}
      error={error}
    >
      {!error && locations.length === 0 && <EmptyState>Nothing on record yet.</EmptyState>}

      {locations.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {locations.map((l) => {
            const cityLine = [l.city, l.state].filter(Boolean).join(', ')
            const full = [l.address, cityLine, l.zip].filter(Boolean).join(' · ')
            return (
              <div key={l.id} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="font-medium text-stone-800">{l.name}</div>
                <div className="mt-1 text-sm text-stone-600">{full || '—'}</div>
                {l.ispName && <div className="mt-2 text-xs text-stone-500">ISP: {l.ispName}</div>}
              </div>
            )
          })}
        </div>
      )}
    </PortalSection>
  )
}
