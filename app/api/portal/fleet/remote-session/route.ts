import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

// Customer self-service remote access (2026-09-13) — portal-side proxy for
// the "Remote access" button on /fleet/devices. FleetHub owns every gate
// (tenant toggle, per-device share, online check) and mints a single-use
// ControlR logon token scoped to that one device; we just forward the
// signed-in user's identity and hand the URL back for a new tab.

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  if (session.aggregateMode) {
    return NextResponse.json({ error: 'switch to a single company first' }, { status: 400 })
  }
  if (session.impersonatedStaffEmail) {
    // Staff have FleetHub for this; a customer-scoped session must be the
    // customer's own action.
    return NextResponse.json({ error: 'not available in a staff view-as session' }, { status: 403 })
  }
  const clientId = await resolveActiveClientId(session)
  if (!clientId) return NextResponse.json({ error: 'no active client link' }, { status: 403 })
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) return NextResponse.json({ error: 'stale client link' }, { status: 403 })

  let body: { deviceId?: string }
  try {
    body = (await req.json()) as { deviceId?: string }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.deviceId) return NextResponse.json({ error: 'deviceId required' }, { status: 400 })

  try {
    const r = await signedPost<{ sessionId: string; url: string; expiresAt: string | null; hostname: string }>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/remote-session',
      {
        portalUserId: session.user.id,
        portalEmail: session.user.email,
        portalUserName: session.user.name,
        clientName,
        deviceId: body.deviceId,
      },
    )
    return NextResponse.json(r)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // signedPost surfaces FleetHub's {error} text; keep it — it's written
    // for the customer ("…is offline right now", "…isn't enabled…").
    return NextResponse.json({ error: msg.replace(/^.*?:\s*/, '') || 'Could not start the session' }, { status: 400 })
  }
}
