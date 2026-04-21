/**
 * Portal role registry — source of truth for role names and their
 * default permission presets. Stored as plain strings in
 * PortalUserClientLink.role, validated here at write/read time.
 *
 * Admin UI to edit presets is intentionally NOT built — 5 archetypes
 * cover the realistic MSP use cases. Per-link JSON overrides on
 * PortalUserClientLink.permissions are the escape hatch for one-offs.
 * See docs/PLAN.md D-Roles for the rationale.
 */

/** All section keys the permission map can carry. */
export const PERMISSION_KEYS = [
  'assets',
  'documents',
  'licenses',
  'contacts',
  'locations',
  'domains',
  'vault',
  'tickets',
  'invoices',
  'estimates',
  'payments',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]
export type PermissionMap = Partial<Record<PermissionKey, boolean>>

export interface PortalRoleDefinition {
  label: string
  description: string
  /** True means "role-bearers can invite and manage other portal users
   *  at the same client." Currently only OWNER. */
  canManageUsers: boolean
  /** Default on/off for each section. Missing keys = false. */
  preset: PermissionMap
}

export const PORTAL_ROLES = {
  OWNER: {
    label: 'Owner',
    description:
      'Full access + can invite/manage other portal users at this client.',
    canManageUsers: true,
    preset: {
      assets: true,
      documents: true,
      licenses: true,
      contacts: true,
      locations: true,
      domains: true,
      vault: true,
      tickets: true,
      invoices: true,
      estimates: true,
      payments: true,
    },
  },
  BILLING: {
    label: 'Billing',
    description:
      'Accounts-payable contact. Invoices, estimates, payments, contacts.',
    canManageUsers: false,
    preset: {
      contacts: true,
      invoices: true,
      estimates: true,
      payments: true,
    },
  },
  TECHNICAL: {
    label: 'Technical',
    description:
      'IT contact. Tickets, assets, documents, licenses, domains, locations.',
    canManageUsers: false,
    preset: {
      assets: true,
      documents: true,
      licenses: true,
      contacts: true,
      locations: true,
      domains: true,
      tickets: true,
    },
  },
  USER: {
    label: 'User',
    description:
      'Regular employee. Can submit/view their own tickets, read documents.',
    canManageUsers: false,
    preset: {
      documents: true,
      contacts: true,
      tickets: true,
    },
  },
  VIEWER: {
    label: 'Viewer',
    description: 'Read-only across everything the client has shared.',
    canManageUsers: false,
    preset: {
      assets: true,
      documents: true,
      licenses: true,
      contacts: true,
      locations: true,
      domains: true,
    },
  },
} satisfies Record<string, PortalRoleDefinition>

export type PortalRoleKey = keyof typeof PORTAL_ROLES

export const PORTAL_ROLE_KEYS = Object.keys(PORTAL_ROLES) as PortalRoleKey[]

export function isPortalRole(value: unknown): value is PortalRoleKey {
  return typeof value === 'string' && value in PORTAL_ROLES
}

/**
 * Resolve effective permissions for a link: start with the role's
 * preset, then apply per-link overrides on top. Missing role falls
 * back to USER's preset so a misconfigured row still renders something
 * sensible instead of throwing.
 */
export function resolvePermissions(
  role: string,
  overrides: PermissionMap | null | undefined,
): Record<PermissionKey, boolean> {
  const def: PortalRoleDefinition = isPortalRole(role)
    ? PORTAL_ROLES[role]
    : PORTAL_ROLES.USER
  const preset: PermissionMap = def.preset
  const out = {} as Record<PermissionKey, boolean>
  for (const key of PERMISSION_KEYS) {
    out[key] = overrides && key in overrides ? !!overrides[key] : !!preset[key]
  }
  return out
}

/** Convenience: does this (role + overrides) allow the given section? */
export function allows(
  role: string,
  overrides: PermissionMap | null | undefined,
  key: PermissionKey,
): boolean {
  return resolvePermissions(role, overrides)[key]
}
