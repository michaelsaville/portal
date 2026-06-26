import { NextResponse } from 'next/server'
import { requireVendorAccessActor, clientVendorBff, bffError } from './_helpers'

export const runtime = 'nodejs'

interface GrantShare {
  id: string
  itemType: 'DOCUMENT' | 'ATTACHMENT' | 'PORTAL_CREDENTIAL'
  itemId: string
  note: string | null
  createdAt: string
  managedByClient: boolean
  label: string
}
interface Grant {
  id: string
  label: string | null
  vendor: { id: string; name: string }
  shares: GrantShare[]
}
interface Shareable {
  documents: Array<{ id: string; title: string; category: string | null }>
  files: Array<{ id: string; originalName: string; mimeType: string; detectedMime: string | null; size: number }>
  credentials: Array<{ id: string; label: string; username: string | null; url: string | null }>
}

/**
 * GET /api/portal/vendor-access
 * Returns the client's active vendor grants (with the items they currently
 * share) and the catalog of items the user is allowed to share.
 */
export async function GET() {
  const gate = await requireVendorAccessActor()
  if (!gate.ok) return gate.res
  const payload = {
    clientId: gate.actor.clientId,
    portalUserId: gate.actor.portalUserId,
    isPortalOwner: gate.actor.isPortalOwner,
  }
  try {
    const [grants, shareable] = await Promise.all([
      clientVendorBff<{ ok: boolean; grants: Grant[] }>('grants', payload),
      clientVendorBff<{ ok: boolean } & Shareable>('shareable', payload),
    ])
    return NextResponse.json({
      grants: grants.grants ?? [],
      shareable: {
        documents: shareable.documents ?? [],
        files: shareable.files ?? [],
        credentials: shareable.credentials ?? [],
      },
    })
  } catch (e) {
    console.error('[portal/vendor-access list]', e)
    const { status, message } = bffError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
