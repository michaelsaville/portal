import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

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
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function warrantyBadge(iso: string | null) {
  if (!iso) return null
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return (
      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
        expired {Math.abs(days)}d ago
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
        {days}d left
      </span>
    )
  }
  return null
}

export default async function AssetsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/assets')

  // Resolve active client: prefer session.activeClientId; otherwise fall
  // back to the user's first link. If the user has no links at all, show
  // the empty-state rather than blowing up with a DocHub query error.
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
          <h1 className="font-serif text-3xl font-bold text-stone-800">Assets</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4">
            <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">
              ← back
            </Link>
          </p>
        </div>
      </main>
    )
  }

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
    error = err instanceof Error ? err.message : String(err)
  }

  // Group by location so the page reads like a real inventory doc.
  const byLocation = new Map<string, { name: string; items: Asset[] }>()
  for (const a of assets) {
    const entry = byLocation.get(a.location.id) ?? {
      name: a.location.name,
      items: [] as Asset[],
    }
    entry.items.push(a)
    byLocation.set(a.location.id, entry)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Assets</h1>
            <p className="mt-1 text-sm text-stone-600">
              {assets.length} active asset{assets.length === 1 ? '' : 's'} on record
            </p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">
            ← back
          </Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load assets: {error}
          </div>
        )}

        {!error && assets.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
            Nothing on record yet. If that seems wrong, let us know.
          </div>
        )}

        {assets.length > 0 && (
          <div className="space-y-8">
            {Array.from(byLocation.values()).map((loc) => (
              <section key={loc.name}>
                <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                  {loc.name}
                </h2>
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
                            {a.room && (
                              <div className="text-xs text-stone-500">{a.room}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-stone-700">
                            {[a.make, a.model].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="px-4 py-2 text-xs text-stone-500 font-mono">
                            {a.serial ?? a.assetTag ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-stone-700">
                            {formatDate(a.warrantyExpiry)}
                            {warrantyBadge(a.warrantyExpiry)}
                          </td>
                          <td className="px-4 py-2">
                            <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                              {a.category}
                            </span>
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
      </div>
    </main>
  )
}
