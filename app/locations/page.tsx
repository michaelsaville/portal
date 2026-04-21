import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

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
          <h1 className="font-serif text-3xl font-bold text-stone-800">Locations</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

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
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Locations</h1>
            <p className="mt-1 text-sm text-stone-600">{locations.length} location{locations.length === 1 ? '' : 's'}</p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load locations: {error}
          </div>
        )}

        {!error && locations.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">Nothing on record yet.</div>
        )}

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
      </div>
    </main>
  )
}
