import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import PortalSection, { NotLinkedYet, EmptyState } from '@/app/components/PortalSection'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface PortalDevice {
  id: string
  hostname: string
  os: string | null
  isOnline: boolean
  lastSeenAt: string | null
  role: string | null
}

interface FleetDevicesResponse {
  devices: PortalDevice[]
}

export default async function FleetDevicesPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/fleet/devices')
  const clientId = await resolveActiveClientId(session)
  if (!clientId) return <NotLinkedYet title="Fleet devices" />
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return (
      <PortalSection title="Fleet devices" error="Stale client link." backHref="/fleet" backLabel="Fleet">
        <span />
      </PortalSection>
    )
  }

  let data: FleetDevicesResponse | null = null
  let error: string | null = null
  try {
    data = await signedPost<FleetDevicesResponse>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/fleet-devices',
      { portalUserId: session.user.id, clientName },
    )
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  const devices = data?.devices ?? []

  return (
    <PortalSection title="Fleet devices" subtitle={`${devices.length} device${devices.length === 1 ? '' : 's'}`} backHref="/fleet" backLabel="Fleet" error={error}>
      {devices.length === 0 ? (
        <EmptyState>No devices on file. If you expect to see some, email PCC2K.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-3 py-2 text-left">Host</th>
                <th className="px-3 py-2 text-left">OS</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Last seen</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-stone-100">
                  <td className="px-3 py-2 font-mono text-[12.5px] text-stone-900">{d.hostname}</td>
                  <td className="px-3 py-2 text-stone-700">{d.os ?? '—'}</td>
                  <td className="px-3 py-2 text-stone-700">{d.role ?? '—'}</td>
                  <td className="px-3 py-2 text-stone-700">{d.lastSeenAt ? relativeAge(d.lastSeenAt) : 'never'}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={
                        d.isOnline
                          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700'
                          : 'inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600'
                      }
                    >
                      <span className={`inline-block h-2 w-2 rounded-full ${d.isOnline ? 'bg-emerald-500' : 'bg-stone-400'}`} />
                      {d.isOnline ? 'online' : 'offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-stone-500">
        Read-only view. To request changes — install / decommission / rename — email{' '}
        <a href="mailto:support@pcc2k.com" className="underline">support@pcc2k.com</a> or open a ticket from the{' '}
        <Link href="/tickets" className="underline">Tickets</Link> page.
      </p>
    </PortalSection>
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
