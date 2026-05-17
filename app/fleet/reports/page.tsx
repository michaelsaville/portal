import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { NotLinkedYet, EmptyState } from '@/app/components/PortalSection'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface PortalReport {
  id: string
  kind: string
  audience: string
  format: string
  generatedAt: string | null
  asOf: string | null
  startDate: string | null
  endDate: string | null
}

interface FleetReportsResponse {
  reports: PortalReport[]
  maxAgeDays: number
}

export default async function FleetReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/fleet/reports')
  const clientId = await resolveActiveClientId(session)
  if (!clientId) return <NotLinkedYet title="Fleet reports" />
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return (
      <PortalSection title="Fleet reports" error="Stale client link." backHref="/fleet" backLabel="Fleet">
        <span />
      </PortalSection>
    )
  }

  let data: FleetReportsResponse | null = null
  let error: string | null = null
  try {
    data = await signedPost<FleetReportsResponse>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/fleet-reports',
      { portalUserId: session.user.id, clientName },
    )
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  const reports = data?.reports ?? []
  const maxAgeDays = data?.maxAgeDays ?? 90

  return (
    <PortalSection
      title="Fleet reports"
      subtitle={`Compliance + posture reports generated for your fleet. Showing the last ${maxAgeDays} days.`}
      backHref="/fleet"
      backLabel="Fleet"
      error={error}
    >
      {reports.length === 0 ? (
        <EmptyState>
          No reports generated yet within your retention window. Reports show up here when PCC2K runs them.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Audience</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Generated</th>
                <th className="px-3 py-2 text-left">Format</th>
                <th className="px-3 py-2 text-right">Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="px-3 py-2 font-medium text-stone-900">{humanKind(r.kind)}</td>
                  <td className="px-3 py-2 text-stone-700 capitalize">{r.audience}</td>
                  <td className="px-3 py-2 text-stone-700">{periodLabel(r)}</td>
                  <td className="px-3 py-2 text-stone-700">
                    {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2 uppercase text-[10.5px] text-stone-500">{r.format}</td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={`/api/portal/fleet-report-download/${encodeURIComponent(r.id)}`}
                      className="text-xs font-medium text-blue-700 hover:underline"
                      title="Mints a fresh 5-minute signed link and opens the file"
                    >
                      Download ↓
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-stone-500">
        Reports are retention-bounded — PCC2K&rsquo;s retention policy sets the visibility window.
      </p>
    </PortalSection>
  )
}

function humanKind(kind: string): string {
  return kind.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function periodLabel(r: PortalReport): string {
  if (r.asOf) return `as of ${new Date(r.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  if (r.startDate && r.endDate) {
    const s = new Date(r.startDate)
    const e = new Date(r.endDate)
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  return '—'
}
