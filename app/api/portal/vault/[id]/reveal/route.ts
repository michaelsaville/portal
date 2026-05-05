import { NextRequest, NextResponse } from 'next/server'
import { requireVaultActor, vaultBff } from '../../_helpers'
import { getActiveVaultSession } from '@/app/lib/vault-session'

export const runtime = 'nodejs'

interface RevealResponse {
  ok: boolean
  password: string | null
  totpCode: string | null
  totpSecret: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireVaultActor()
  if (!gate.ok) return gate.res
  const { id } = await params

  const active = await getActiveVaultSession(
    gate.actor.portalUserId,
    gate.actor.clientId,
  )
  if (!active) {
    return NextResponse.json({ error: 'Vault locked' }, { status: 403 })
  }

  try {
    const r = await vaultBff<RevealResponse>('reveal', {
      id,
      clientId: gate.actor.clientId,
      portalUserId: gate.actor.portalUserId,
      isPortalOwner: gate.actor.isPortalOwner,
    })
    return NextResponse.json({
      password: r.password,
      totpCode: r.totpCode,
      totpSecret: r.totpSecret,
    })
  } catch (e) {
    console.error('[portal/vault reveal]', e)
    return NextResponse.json({ error: 'Reveal failed' }, { status: 502 })
  }
}
