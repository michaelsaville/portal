import {
  PORTAL_ROLES,
  type PermissionKey,
  type PermissionMap,
} from '@/app/lib/portal-roles'

/**
 * Resolve "does this user/link have permission X?" by stacking the
 * role preset under the per-link override map. Per-link `permissions`
 * is `{} | { vault: false, ... }` and beats the role preset when set.
 */
export function hasPermission(
  role: string,
  permissions: unknown,
  key: PermissionKey,
): boolean {
  const overrides = (permissions ?? {}) as PermissionMap
  if (typeof overrides[key] === 'boolean') return !!overrides[key]
  const preset = PORTAL_ROLES[role as keyof typeof PORTAL_ROLES]?.preset as
    | PermissionMap
    | undefined
  return !!preset?.[key]
}

export function isOwnerRole(role: string): boolean {
  return role === 'OWNER'
}
