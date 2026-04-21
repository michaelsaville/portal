import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

export const dynamic = 'force-dynamic'

interface Estimate {
  id: string
  estimateNumber: number
  title: string
  status: string
  totalAmount: number
  validUntil: string | null
  sentAt: string | null
  approvedAt: string | null
  declinedAt: string | null
  convertedAt: string | null
  createdAt: string
}

interface EstimatesResponse {
  ok: boolean
  client: { id: string; name: string } | null
  estimates: Estimate[]
  error?: string
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    SENT: 'bg-sky-100 text-sky-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    DECLINED: 'bg-stone-100 text-stone-600',
    EXPIRED: 'bg-amber-100 text-amber-800',
    CONVERTED: 'bg-violet-100 text-violet-800',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? 'bg-stone-100 text-stone-700'}`}>
      {status.toLowerCase()}
    </span>
  )
}

export default async function EstimatesPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/estimates')

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
          <h1 className="font-serif text-3xl font-bold text-stone-800">Estimates</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

  const nameRows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM public."Client" WHERE id = ${activeClientId} LIMIT 1
  `
  const clientName = nameRows[0]?.name ?? null

  let estimates: Estimate[] = []
  let error: string | null = null
  if (!clientName) {
    error = "Couldn't resolve client name — tell PCC2K this link seems stale."
  } else {
    try {
      const data = await signedPost<EstimatesResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/estimates',
        { clientName },
      )
      estimates = data.estimates ?? []
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  const pending = estimates.filter((e) => e.status === 'SENT')
  const pendingTotal = pending.reduce((sum, e) => sum + e.totalAmount, 0)

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Estimates</h1>
            <p className="mt-1 text-sm text-stone-600">
              {estimates.length === 0 ? 'no estimates on record' : `${pending.length} awaiting your review (${money(pendingTotal)}) · ${estimates.length} total`}
            </p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load estimates: {error}
          </div>
        )}

        {!error && estimates.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
            Nothing on record.
          </div>
        )}

        {estimates.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2 w-16">#</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Sent</th>
                  <th className="px-4 py-2">Valid until</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {estimates.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-mono text-xs text-stone-500">#{e.estimateNumber}</td>
                    <td className="px-4 py-2 text-stone-800">{e.title}</td>
                    <td className="px-4 py-2">{statusBadge(e.status)}</td>
                    <td className="px-4 py-2 text-right text-stone-700 whitespace-nowrap">{money(e.totalAmount)}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(e.sentAt)}</td>
                    <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(e.validUntil)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-xs text-stone-500">
          To approve or decline an estimate, reply to the email PCC2K sent you. Approve-in-portal is on the roadmap.
        </p>
      </div>
    </main>
  )
}
