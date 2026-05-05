import { NextRequest, NextResponse } from 'next/server'
import { requireVaultActor, vaultBff } from './_helpers'

export const runtime = 'nodejs'

interface ListResponse {
  ok: boolean
  items: Array<Record<string, unknown>>
}

export async function GET() {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  try {
    const r = await vaultBff<ListResponse>('list', {
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      isPortalOwner: gate.actor.isPortalOwner,
    })
    return NextResponse.json(r.items ?? [])
  } catch (e) {
    console.error('[portal/vault list]', e)
    return NextResponse.json({ error: 'Vault unavailable' }, { status: 502 })
  }
}

interface CreateResponse {
  ok: boolean
  item: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  const body = (await req.json()) as {
    label?: string
    username?: string
    password?: string
    totp?: string
    url?: string
    notes?: string
    visibility?: string
  }
  if (!body.label?.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }
  try {
    const r = await vaultBff<CreateResponse>('create', {
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      label: body.label,
      username: body.username,
      password: body.password,
      totp: body.totp,
      url: body.url,
      notes: body.notes,
      visibility: body.visibility,
    })
    return NextResponse.json(r.item, { status: 201 })
  } catch (e) {
    console.error('[portal/vault create]', e)
    return NextResponse.json({ error: 'Create failed' }, { status: 502 })
  }
}
