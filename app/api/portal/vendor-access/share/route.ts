import { NextRequest, NextResponse } from 'next/server'
import { requireVendorAccessActor, clientVendorBff, bffError } from '../_helpers'

export const runtime = 'nodejs'

const MANAGEABLE = new Set(['DOCUMENT', 'ATTACHMENT', 'PORTAL_CREDENTIAL'])

interface ShareResponse {
  ok: boolean
  share?: Record<string, unknown>
  error?: string
}

/**
 * POST /api/portal/vendor-access/share
 * Body: { grantId, itemType, itemId, note? }
 * Shares one of the client's own items with a vendor (DocHub re-checks the
 * grant, ownership, and visibility).
 */
export async function POST(req: NextRequest) {
  const gate = await requireVendorAccessActor()
  if (!gate.ok) return gate.res
  const body = (await req.json().catch(() => ({}))) as {
    grantId?: string
    itemType?: string
    itemId?: string
    note?: string
  }
  if (!body.grantId || !body.itemId || !body.itemType || !MANAGEABLE.has(body.itemType)) {
    return NextResponse.json({ error: 'grantId, itemId and a valid itemType are required' }, { status: 400 })
  }
  try {
    const r = await clientVendorBff<ShareResponse>('share', {
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      isPortalOwner: gate.actor.isPortalOwner,
      grantId: body.grantId,
      itemType: body.itemType,
      itemId: body.itemId,
      note: body.note,
    })
    // clientVendorBff only resolves on a 2xx (signedPost throws otherwise),
    // so r.ok is always true here; real failures land in catch.
    return NextResponse.json({ ok: true, share: r.share }, { status: 201 })
  } catch (e) {
    console.error('[portal/vendor-access share]', e)
    const { status, message } = bffError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
