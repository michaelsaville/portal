import 'server-only'
import { NextResponse } from 'next/server'
import { signedPost } from '@/app/lib/bff-client'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { hasPermission } from '@/app/lib/permissions'

export interface VendorAccessActor {
  portalUserId: string
  clientId: string
  isPortalOwner: boolean
}

export type GateResult =
  | { ok: true; actor: VendorAccessActor }
  | { ok: false; res: NextResponse }

/**
 * Gate for every /api/portal/vendor-access/* route. Confirms a signed-in
 * session, an active client, a link to that client, and the `vendorAccess`
 * permission. Returns the verified actor block forwarded to DocHub — the
 * client never supplies its own portalUserId/clientId; we derive them from
 * the session cookie.
 */
export async function requireVendorAccessActor(): Promise<GateResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const clientId = session.activeClientId
  if (!clientId) {
    return { ok: false, res: NextResponse.json({ error: 'No active company' }, { status: 400 }) }
  }
  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { role: true, permissions: true },
  })
  if (!link) {
    return { ok: false, res: NextResponse.json({ error: 'Not linked' }, { status: 403 }) }
  }
  if (!hasPermission(link.role, link.permissions, 'vendorAccess')) {
    return { ok: false, res: NextResponse.json({ error: 'No vendor-access permission' }, { status: 403 }) }
  }
  return {
    ok: true,
    actor: {
      portalUserId: session.user.id,
      clientId,
      isPortalOwner: link.role === 'OWNER',
    },
  }
}

const DOCHUB = process.env.DOCHUB_BFF_URL ?? ''

export async function clientVendorBff<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return signedPost<T>(DOCHUB, `/api/bff/portal/dochub/client-vendor/${path}`, payload)
}

/**
 * signedPost throws `BFF HTTP <status>: <detail>` on any non-2xx. Parse that
 * back into a status + message so the real DocHub error (e.g. "Already
 * shared", 409) surfaces to the client instead of an opaque 502. Upstream
 * 4xx are propagated as-is; anything else becomes a 502.
 */
export function bffError(e: unknown): { status: number; message: string } {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.match(/^BFF HTTP (\d+)(?:: ([\s\S]*))?$/)
  if (m) {
    const upstream = parseInt(m[1], 10)
    const status = upstream >= 400 && upstream < 500 ? upstream : 502
    return { status, message: m[2]?.trim() || `Request failed (${upstream})` }
  }
  return { status: 502, message: 'Service unavailable' }
}
