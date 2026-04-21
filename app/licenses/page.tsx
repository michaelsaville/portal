import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

export const dynamic = 'force-dynamic'

interface License {
  id: string
  name: string
  vendor: string | null
  seats: number | null
  assignedSeats: number | null
  expiryDate: string | null
  renewalDate: string | null
  billingTerm: string | null
  status: string | null
  person: { name: string } | null
}

interface LicensesResponse {
  ok: boolean
  licenses: License[]
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

export default async function LicensesPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/licenses')

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
          <h1 className="font-serif text-3xl font-bold text-stone-800">Licenses</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

  let licenses: License[] = []
  let error: string | null = null
  try {
    const data = await signedPost<LicensesResponse>(
      process.env.DOCHUB_BFF_URL ?? '',
      '/api/bff/portal/dochub/licenses',
      { clientId: activeClientId },
    )
    licenses = data.licenses ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Licenses</h1>
            <p className="mt-1 text-sm text-stone-600">{licenses.length} active license{licenses.length === 1 ? '' : 's'}</p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load licenses: {error}
          </div>
        )}

        {!error && licenses.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">Nothing on record yet.</div>
        )}

        {licenses.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2">Seats</th>
                  <th className="px-4 py-2">Assigned to</th>
                  <th className="px-4 py-2">Renews</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {licenses.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      <div className="text-stone-800">{l.name}</div>
                      {l.billingTerm && <div className="text-xs text-stone-500">{l.billingTerm}</div>}
                    </td>
                    <td className="px-4 py-2 text-stone-700">{l.vendor ?? '—'}</td>
                    <td className="px-4 py-2 text-stone-700">
                      {l.seats != null ? (l.assignedSeats != null ? `${l.assignedSeats}/${l.seats}` : l.seats) : '—'}
                    </td>
                    <td className="px-4 py-2 text-stone-700">{l.person?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-stone-700">
                      {formatDate(l.renewalDate ?? l.expiryDate)}
                      {expiryBadge(l.renewalDate ?? l.expiryDate)}
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
