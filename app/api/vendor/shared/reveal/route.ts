import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { getVendorGrants, resolveActiveGrant, revealCredential } from '@/app/lib/dochub-vendor'

export const dynamic = 'force-dynamic'

/**
 * Session-gated reveal proxy. The vendor's browser never talks to DocHub
 * directly — the portal validates the VENDOR session, confirms the requested
 * client is one of their active grants, then asks DocHub to decrypt (DocHub
 * re-checks the credential is actually shared and logs the reveal).
 *
 * Body: { clientId, credentialId }
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.user.persona !== 'VENDOR') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { clientId?: string; credentialId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
  if (!body.clientId || !body.credentialId) {
    return NextResponse.json({ error: 'clientId and credentialId required' }, { status: 400 })
  }

  const grants = await getVendorGrants(session.user.id)
  const grant = resolveActiveGrant(grants, body.clientId)
  if (!grant || grant.clientId !== body.clientId) {
    return NextResponse.json({ error: 'no access to this client' }, { status: 403 })
  }

  try {
    const result = await revealCredential(grant, body.credentialId)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'reveal failed' }, { status: 502 })
  }
}
