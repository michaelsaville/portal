import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { NotLinkedYet, EmptyState } from '@/app/components/PortalSection'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

// Phase 8 Workstream D step 6.2 — patch posture for the customer
// portal. Sanitized: severity-band counts only. No CVE IDs, no
// per-device detail. The "see PCC2K" affordance is the resolution
// path — patching itself is a tech-side action.

interface FleetPatchesResponse {
  deviceCount: number
  devicesFullyPatched: number
  critical: number
  high: number
  other: number
  kev: number
  lastScanAt: string | null
}

export default async function FleetPatchesPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/fleet/patches')
  const clientId = await resolveActiveClientId(session)
  if (!clientId) return <NotLinkedYet title="Fleet patches" />
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return (
      <PortalSection title="Fleet patches" error="Stale client link." backHref="/fleet" backLabel="Fleet">
        <span />
      </PortalSection>
    )
  }

  let data: FleetPatchesResponse | null = null
  let error: string | null = null
  try {
    data = await signedPost<FleetPatchesResponse>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/fleet-patches',
      { portalUserId: session.user.id, clientName },
    )
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  if (!data) {
    return (
      <PortalSection title="Fleet patches" backHref="/fleet" backLabel="Fleet" error={error}>
        <EmptyState>Unable to load patch posture.</EmptyState>
      </PortalSection>
    )
  }

  const totalMissing = data.critical + data.high + data.other
  const allClear = totalMissing === 0

  return (
    <PortalSection
      title="Fleet patches"
      subtitle="Missing security and feature updates across your devices."
      backHref="/fleet"
      backLabel="Fleet"
      error={error}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Critical"
            value={data.critical}
            sub={data.kev > 0 ? `${data.kev} known-exploited` : 'CVSS ≥ 9 or KEV'}
            tone={data.critical > 0 ? 'critical' : 'ok'}
          />
          <Stat
            label="High"
            value={data.high}
            sub="CVSS 7–8.9"
            tone={data.high > 0 ? 'warn' : 'ok'}
          />
          <Stat
            label="Other"
            value={data.other}
            sub="lower-severity backlog"
            tone="neutral"
          />
          <Stat
            label="Fully patched"
            value={`${data.devicesFullyPatched} / ${data.deviceCount}`}
            sub="devices with zero missing"
            tone={data.devicesFullyPatched === data.deviceCount && data.deviceCount > 0 ? 'ok' : 'neutral'}
          />
        </div>

        {allClear ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            ✓ All approved patches are installed across your fleet.{' '}
            {data.lastScanAt ? `Last scan ${relativeAge(data.lastScanAt)}.` : ''}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>
              {totalMissing} approved update{totalMissing === 1 ? '' : 's'} pending across{' '}
              {data.deviceCount} active device{data.deviceCount === 1 ? '' : 's'}.{' '}
              {data.lastScanAt ? `Last scan ${relativeAge(data.lastScanAt)}.` : ''}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              PCC2K schedules patch deployments per your change-window policy.
              Email <a href="mailto:support@pcc2k.com" className="underline">support@pcc2k.com</a>{' '}
              if you want to accelerate or defer a window.
            </p>
          </div>
        )}

        <p className="text-xs text-stone-500">
          Patch-level CVE detail and per-host install state are intentionally
          hidden from this view. PCC2K staff see the full picture in FleetHub.
          Declined patches are excluded from these counts.
        </p>
      </div>
    </PortalSection>
  )
}

function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  sub: string
  tone?: 'neutral' | 'ok' | 'warn' | 'critical'
}) {
  const valueClass =
    tone === 'critical' ? 'text-red-700'
      : tone === 'warn' ? 'text-amber-700'
      : tone === 'ok' ? 'text-emerald-700'
      : 'text-stone-900'
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
      <div className="mt-1 text-xs text-stone-500">{sub}</div>
    </div>
  )
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
