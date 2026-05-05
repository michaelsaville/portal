import { NextRequest, NextResponse } from 'next/server'
import { requireVaultActor, vaultBff } from '../_helpers'

export const runtime = 'nodejs'

interface UpdateResponse {
  ok: boolean
  item: Record<string, unknown>
}
interface OkResponse {
  ok: boolean
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  const { id } = await params
  const body = (await req.json()) as Record<string, unknown>
  try {
    const r = await vaultBff<UpdateResponse>('update', {
      id,
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      isPortalOwner: gate.actor.isPortalOwner,
      ...body,
    })
    return NextResponse.json(r.item)
  } catch (e) {
    console.error('[portal/vault update]', e)
    return NextResponse.json({ error: 'Update failed' }, { status: 502 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  const { id } = await params
  try {
    await vaultBff<OkResponse>('delete', {
      id,
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      isPortalOwner: gate.actor.isPortalOwner,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[portal/vault delete]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 502 })
  }
}
