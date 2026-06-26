import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { signedPost } from '@/app/lib/bff-client'

/**
 * Vendor-portal data layer: the DocHub-client access axis for VENDOR-persona
 * users. A vendor sees ONLY what a client has shared with them; DocHub owns
 * that authorization and we call its vendor BFF with the (vendorId, clientId)
 * recorded in PortalVendorClientGrant.
 */

const DOCHUB = process.env.DOCHUB_BFF_URL ?? ''

export interface VendorGrant {
  dochubVendorId: string
  vendorName: string
  clientId: string
  clientName: string
}

/** Active DocHub grants for a vendor user, newest selection cached locally. */
export async function getVendorGrants(portalUserId: string): Promise<VendorGrant[]> {
  const rows = await prisma.portalVendorClientGrant.findMany({
    where: { portalUserId, isActive: true },
    orderBy: { clientName: 'asc' },
    select: { dochubVendorId: true, vendorName: true, clientId: true, clientName: true },
  })
  return rows
}

/**
 * Resolve the grant a vendor is currently acting under. Honors the session's
 * activeVendorGrantId (clientId), else falls back to the first grant.
 */
export function resolveActiveGrant(
  grants: VendorGrant[],
  activeClientId: string | null,
): VendorGrant | null {
  if (grants.length === 0) return null
  if (activeClientId) {
    const match = grants.find((g) => g.clientId === activeClientId)
    if (match) return match
  }
  return grants[0]
}

function vendorBff<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  return signedPost<T>(DOCHUB, `/api/bff/portal/dochub/vendor/${path}`, payload)
}

export interface SharedCredential {
  id: string
  label: string
  username: string | null
  url: string | null
  hasPassword: boolean
  hasTotp: boolean
}
export interface SharedDocument {
  id: string
  title: string
  category: string | null
  content: string | null
  updatedAt: string
}
export interface SharedFile {
  id: string
  originalName: string
  mimeType: string
  detectedMime: string | null
  size: number
  previewable: boolean
  createdAt: string
}

export interface SharedBundle {
  ok: boolean
  grant?: { label: string | null }
  credentials: SharedCredential[]
  documents: SharedDocument[]
  files: SharedFile[]
}

/** Everything shared with this vendor for this client (no secrets). */
export function fetchShared(grant: VendorGrant): Promise<SharedBundle> {
  return vendorBff<SharedBundle>('shared', {
    vendorId: grant.dochubVendorId,
    clientId: grant.clientId,
  })
}

/** Decrypt one shared credential. Re-checked server-side against the share. */
export function revealCredential(
  grant: VendorGrant,
  credentialId: string,
): Promise<{ ok: boolean; password: string | null; totpCode: string | null; error?: string }> {
  return vendorBff('reveal', {
    vendorId: grant.dochubVendorId,
    clientId: grant.clientId,
    credentialId,
  })
}
