import 'server-only'
import { prisma } from '@/app/lib/prisma'
import type { ResolvedSession } from '@/app/lib/portal-auth'
import {
  resolvePermissions,
  PERMISSION_KEYS,
  type PermissionKey,
  type PermissionMap,
} from '@/app/lib/portal-roles'

/**
 * Section-permission enforcement (2026-11-12).
 *
 * Role presets + per-link overrides (portal-roles.ts) existed since phase 1
 * but nothing checked them, so every linked user saw every section —
 * including the Vault. Every customer page and /api/portal route that
 * belongs to a section now asks here first.
 *
 * Rules:
 *  - Normal session → the (user, client) link's role preset + overrides.
 *    No link → nothing.
 *  - Staff "view as client" (shared synthetic impersonator user) → full
 *    access: staff are looking at the client, not at a person.
 *  - Staff "view as <user>" (impersonating a real portal user) → exactly
 *    that user's permissions, so staff see the layout the customer sees.
 */

export const IMPERSONATION_USER_EMAIL = 'impersonator@internal.pcc2k.com'

export type SectionAccess = Record<PermissionKey, boolean>

const ALL_ON = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as SectionAccess
const ALL_OFF = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as SectionAccess

export function isClientWideImpersonation(session: ResolvedSession): boolean {
  return (
    !!session.impersonatedStaffEmail &&
    session.user.email.toLowerCase() === IMPERSONATION_USER_EMAIL
  )
}

export async function getSectionAccess(
  session: ResolvedSession,
  clientId: string | null,
): Promise<SectionAccess> {
  if (!clientId) return ALL_OFF
  if (isClientWideImpersonation(session)) return ALL_ON
  const link = await prisma.portalUserClientLink.findUnique({
    where: { portalUserId_clientId: { portalUserId: session.user.id, clientId } },
    select: { role: true, permissions: true },
  })
  if (!link) return ALL_OFF
  return resolvePermissions(link.role, (link.permissions ?? {}) as PermissionMap)
}

export async function canAccess(
  session: ResolvedSession,
  clientId: string | null,
  key: PermissionKey,
): Promise<boolean> {
  return (await getSectionAccess(session, clientId))[key]
}

/** Aggregate-mode fan-out: keep only the linked clients that allow `key`. */
export async function filterClientIdsByAccess(
  session: ResolvedSession,
  clientIds: string[],
  key: PermissionKey,
): Promise<string[]> {
  if (isClientWideImpersonation(session)) return clientIds
  const links = await prisma.portalUserClientLink.findMany({
    where: { portalUserId: session.user.id, clientId: { in: clientIds } },
    select: { clientId: true, role: true, permissions: true },
  })
  const ok = new Set(
    links
      .filter((l) => resolvePermissions(l.role, (l.permissions ?? {}) as PermissionMap)[key])
      .map((l) => l.clientId),
  )
  return clientIds.filter((id) => ok.has(id))
}
