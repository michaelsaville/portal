import { NextRequest, NextResponse } from 'next/server'
import { requireVendorAccessActor, clientVendorBff, bffError } from '../_helpers'

export const runtime = 'nodejs'

interface UnshareResponse {
  ok: boolean
  error?: string
}

/**
 * POST /api/portal/vendor-access/unshare
 * Body: { grantId, shareId }
 * Stops sharing an item with a vendor. DocHub only removes manageable-type
 * shares under a grant belonging to this client.
 */
export async function POST(req: NextRequest) {
  const gate = await requireVendorAccessActor()
  if (!gate.ok) return gate.res
  const body = (await req.json().catch(() => ({}))) as { grantId?: string; shareId?: string }
  if (!body.grantId || !body.shareId) {
    return NextResponse.json({ error: 'grantId and shareId are required' }, { status: 400 })
  }
  try {
    await clientVendorBff<UnshareResponse>('unshare', {
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      isPortalOwner: gate.actor.isPortalOwner,
      grantId: body.grantId,
      shareId: body.shareId,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[portal/vendor-access unshare]', e)
    const { status, message } = bffError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
