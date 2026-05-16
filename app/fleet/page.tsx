import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { NotLinkedYet } from '@/app/components/PortalSection'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

// Phase 7 Workstream D — customer-facing fleet summary. Pulls
// from the FleetHub BFF (sanitized counts only — no alert titles,
// no IPs, no inventory detail). Read-only by design.

interface FleetSummary {
  deviceCount: number
  onlineCount: number
  hostsOffline24h: number
  openAlerts: number
  latestActivityAt: string | null
  latestReport: {
    id: string
    kind: string
    generatedAt: string | null
  } | null
}

export default async function FleetSummaryPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/fleet')
  const clientId = await resolveActiveClientId(session)
  if (!clientId) return <NotLinkedYet title="Fleet" />
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return (
      <PortalSection title="Fleet" error="Your client link is stale — ask PCC2K to refresh it." subtitle={null}>
        <span />
      </PortalSection>
    )
  }

  let summary: FleetSummary | null = null
  let error: string | null = null
  try {
    summary = await signedPost<FleetSummary>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/fleet-summary',
      { portalUserId: session.user.id, clientName },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/HTTP 403/.test(msg)) {
      return (
        <PortalSection
          title="Fleet"
          subtitle="Not enabled for your account yet"
        >
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Fleet visibility is enabled on a per-client basis. Ask PCC2K to flip it on for your account.
          </p>
        </PortalSection>
      )
    }
    error = msg
  }

  return (
    <PortalSection title="Fleet" subtitle="Your devices, online status, alerts, and reports — at a glance." error={error}>
      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Devices" value={summary.deviceCount} sub={`${summary.onlineCount} online`} />
            <Stat
              label="Offline >24h"
              value={summary.hostsOffline24h}
              sub={summary.hostsOffline24h === 0 ? 'all reporting' : 'needs attention'}
              tone={summary.hostsOffline24h > 0 ? 'warn' : 'ok'}
            />
            <Stat
              label="Open alerts"
              value={summary.openAlerts}
              sub={summary.openAlerts === 0 ? 'all clear' : 'see PCC2K for details'}
              tone={summary.openAlerts > 0 ? 'warn' : 'ok'}
            />
            <Stat
              label="Last seen"
              value={summary.latestActivityAt ? relativeAge(summary.latestActivityAt) : '—'}
              sub="freshest device check-in"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/fleet/devices"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              View devices
            </Link>
            <Link
              href="/fleet/reports"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              View reports
            </Link>
            {summary.latestReport && (
              <span className="self-center text-xs text-stone-500">
                Most recent: {humanKind(summary.latestReport.kind)}{' '}
                {summary.latestReport.generatedAt ? `(${relativeAge(summary.latestReport.generatedAt)})` : ''}
              </span>
            )}
          </div>

          <p className="text-xs text-stone-500">
            Open alerts can&rsquo;t be acked from the portal — that&rsquo;s on the PCC2K team. Email{' '}
            <a href="mailto:support@pcc2k.com" className="underline">support@pcc2k.com</a> if something looks wrong.
          </p>
        </div>
      )}
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
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const valueClass =
    tone === 'warn' ? 'text-amber-700'
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

function humanKind(kind: string): string {
  return kind.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
