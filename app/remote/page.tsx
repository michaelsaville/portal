import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/portal-auth'
import PortalSection, { EmptyState, NotLinkedYet } from '@/app/components/PortalSection'
import AggregateNotSupported from '@/app/components/AggregateNotSupported'
import { resolveActiveClientId } from '@/app/lib/portal-section'
import { breezeOrgIdForClient, grantsFor } from '@/app/lib/remote-access'
import { listOrgDevices, deviceLabel, type BreezeDevice } from '@/app/lib/breeze'
import { ConnectButton } from './ConnectButton'

export const dynamic = 'force-dynamic'

const VIEWER_WINDOWS = 'https://breeze.pcc2k.com/api/v1/viewers/download/windows'
const VIEWER_MAC = 'https://breeze.pcc2k.com/api/v1/viewers/download/macos'

function lastSeen(iso: string | null): string {
  if (!iso) return 'never seen'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs} hr ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function RemoteAccessPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/remote')
  if (session.aggregateMode) return <AggregateNotSupported title="Remote access" />

  const clientId = await resolveActiveClientId(session)
  if (!clientId) return <NotLinkedYet title="Remote access" />

  const staffView = !!session.impersonatedStaffEmail
  const grants = await grantsFor(session.user.id, clientId)

  let live = new Map<string, BreezeDevice>()
  let error: string | null = null
  if (grants.length > 0) {
    const orgId = await breezeOrgIdForClient(clientId)
    if (!orgId) {
      error = 'Remote access is not set up for this company yet. Contact PCC2K.'
    } else {
      try {
        live = new Map((await listOrgDevices(orgId)).map((d) => [d.id, d]))
      } catch (err) {
        console.error('[remote page]', err)
        error = "Couldn't check which computers are online right now. You can still try Connect."
      }
    }
  }

  return (
    <PortalSection
      title="Remote access"
      subtitle="Connect to your work computer from wherever you are."
      error={error}
    >
      {grants.length === 0 ? (
        <EmptyState>
          No computers are set up for remote access on your account. Contact PCC2K if you need one.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {grants.map((g) => {
            const d = live.get(g.breezeDeviceId)
            const known = live.size > 0
            // Live status unknown (Breeze unreachable) → let them try; the
            // connect route re-checks everything server-side anyway.
            const online = known ? !!d && d.status === 'online' : true
            const name = d ? deviceLabel(d) : g.deviceLabel
            return (
              <li
                key={g.id}
                className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-serif text-lg font-semibold text-stone-800">{name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-stone-600">
                    {known && d ? (
                      <>
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-600' : 'bg-stone-400'}`}
                          aria-hidden
                        />
                        <span>{online ? 'Online' : `Offline · last seen ${lastSeen(d.lastSeenAt)}`}</span>
                      </>
                    ) : known ? (
                      <span>No longer available — contact PCC2K.</span>
                    ) : (
                      <span>Status unavailable</span>
                    )}
                  </div>
                </div>
                <ConnectButton
                  deviceId={g.breezeDeviceId}
                  label={name}
                  online={online}
                  staffView={staffView}
                />
              </li>
            )
          })}
        </ul>
      )}

      {grants.length > 0 && (
        <section className="mt-8 rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="font-serif text-lg font-semibold text-stone-800">How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-700">
            <li>
              <span className="font-medium">First time on this computer:</span> install Breeze Viewer —{' '}
              <a href={VIEWER_WINDOWS} className="underline hover:text-stone-900">Windows</a>
              {' · '}
              <a href={VIEWER_MAC} className="underline hover:text-stone-900">Mac</a>. You only do this once.
            </li>
            <li>Click <span className="font-medium">Connect</span> next to your work computer.</li>
            <li>
              If your browser asks to open Breeze Viewer, choose <span className="font-medium">Open</span>
              {' '}(tick &ldquo;always allow&rdquo; so it won&apos;t ask again).
            </li>
            <li>Your work computer&apos;s screen appears. Close the Viewer window when you&apos;re done.</li>
          </ol>
          <p className="mt-4 text-xs text-stone-500">
            Your work computer must be turned on and connected to the internet. Sessions are logged.
            Trouble connecting? Call or email PCC2K at{' '}
            <a href="mailto:hello@pcc2k.com" className="underline hover:text-stone-700">hello@pcc2k.com</a>.
          </p>
        </section>
      )}
    </PortalSection>
  )
}
