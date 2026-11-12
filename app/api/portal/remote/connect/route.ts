import { NextRequest, NextResponse } from 'next/server'
import { getSession, audit } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { resolveActiveClientId } from '@/app/lib/portal-section'
import { breezeOrgIdForClient } from '@/app/lib/remote-access'
import { BreezeError, listOrgDevices, startDesktopSession, deviceLabel } from '@/app/lib/breeze'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/remote/connect  { deviceId }
 *
 * The whole customer remote-access gate. The Breeze broker user can reach
 * every device, so nothing is sent to Breeze until ALL of these hold:
 *   1. a real customer session (not a staff view-as — staff use Breeze),
 *   2. a single active company (not aggregate mode),
 *   3. a PortalRemoteGrant for (this user, this company, this device),
 *   4. the company maps to a Breeze org and the device is IN that org
 *      (a grant left behind after a device moved orgs stops working),
 *   5. the device is online.
 * Returns the breeze:// deep link for Breeze Viewer.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (session.impersonatedStaffEmail) {
    return NextResponse.json(
      { error: 'Staff view: the customer would connect here. Use Breeze to connect yourself.' },
      { status: 403 },
    )
  }
  if (session.aggregateMode) {
    return NextResponse.json({ error: 'Pick a single company first.' }, { status: 400 })
  }

  let deviceId = ''
  try {
    deviceId = String(((await req.json()) as { deviceId?: unknown }).deviceId ?? '')
  } catch {
    /* fall through */
  }
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) {
    return NextResponse.json({ error: 'Unknown computer.' }, { status: 400 })
  }

  const clientId = await resolveActiveClientId(session)
  if (!clientId) return NextResponse.json({ error: 'No company linked.' }, { status: 403 })

  const grant = await prisma.portalRemoteGrant.findFirst({
    where: { portalUserId: session.user.id, clientId, breezeDeviceId: deviceId },
  })
  if (!grant) {
    return NextResponse.json({ error: "You don't have remote access to that computer." }, { status: 403 })
  }

  const orgId = await breezeOrgIdForClient(clientId)
  if (!orgId) {
    return NextResponse.json({ error: 'Remote access is not set up for this company yet. Contact PCC2K.' }, { status: 409 })
  }

  try {
    const device = (await listOrgDevices(orgId)).find((d) => d.id === deviceId)
    if (!device) {
      return NextResponse.json(
        { error: 'That computer is no longer available. Contact PCC2K.' },
        { status: 409 },
      )
    }
    if (device.status !== 'online') {
      return NextResponse.json(
        { error: `${deviceLabel(device)} is offline right now. Make sure it is turned on and connected, then try again.` },
        { status: 409 },
      )
    }

    const { sessionId, deepLink } = await startDesktopSession(deviceId)

    await audit('REMOTE_SESSION_START', {
      portalUserId: session.user.id,
      clientId,
      data: { breezeDeviceId: deviceId, device: deviceLabel(device), breezeSessionId: sessionId },
    })

    return NextResponse.json({ deepLink, device: deviceLabel(device) })
  } catch (err) {
    const e = err instanceof BreezeError ? err : null
    console.error('[remote/connect]', err)
    await audit('REMOTE_SESSION_FAILED', {
      portalUserId: session.user.id,
      clientId,
      data: { breezeDeviceId: deviceId, error: err instanceof Error ? err.message : String(err), code: e?.code },
    }).catch(() => {})
    const message =
      e?.code === 'BROKER_NOT_CONFIGURED'
        ? 'Remote access is not set up yet. Contact PCC2K.'
        : e?.status === 429
          ? 'Too many remote sessions are open right now. Try again in a few minutes.'
          : "Couldn't start the remote session. Try again, or contact PCC2K."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
