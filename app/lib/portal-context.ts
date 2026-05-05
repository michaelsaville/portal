import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { getSession, type ResolvedSession } from '@/app/lib/portal-auth'
import { isPortalAdminEmail } from '@/app/lib/portal-admin'

export interface CompanyLink {
  clientId: string
  name: string
  role: string
}

export interface ActiveCompany {
  id: string
  name: string
  role: string
}

export interface PortalContext {
  session: ResolvedSession
  links: CompanyLink[]
  activeCompany: ActiveCompany | null
  isImpersonating: boolean
  isAdmin: boolean
}

/**
 * One-stop server helper for chrome that needs to know who the user is,
 * which companies they belong to, and which one is currently active.
 *
 * Returns null when there's no signed-in session — callers can either
 * skip rendering chrome (PortalShell) or redirect to /login.
 *
 * Pulls Client names from DocHub's `public.Client` table via raw query
 * because the portal Prisma schema only manages its own schema.
 */
export async function getPortalContext(): Promise<PortalContext | null> {
  const session = await getSession()
  if (!session) return null

  const isImpersonating = !!session.impersonatedStaffEmail

  // Impersonation tunnels are pinned to a single client — don't surface
  // the switcher even if the underlying user has multiple links.
  if (isImpersonating) {
    let activeCompany: ActiveCompany | null = null
    if (session.activeClientId) {
      const rows = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
        `SELECT id, name FROM public."Client" WHERE id = $1`,
        session.activeClientId,
      )
      const r = rows[0]
      if (r) {
        activeCompany = { id: r.id, name: r.name, role: 'IMPERSONATED' }
      }
    }
    return {
      session,
      links: [],
      activeCompany,
      isImpersonating,
      isAdmin: false,
    }
  }

  const links = await prisma.portalUserClientLink.findMany({
    where: { portalUserId: session.user.id },
    select: { clientId: true, role: true },
    orderBy: { createdAt: 'asc' },
  })

  let enriched: CompanyLink[] = []
  if (links.length > 0) {
    const ids = links.map((l) => l.clientId)
    const rows = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
      `SELECT id, name FROM public."Client" WHERE id = ANY($1::text[])`,
      ids,
    )
    const nameMap = new Map<string, string>(rows.map((r) => [r.id, r.name]))
    enriched = links
      .map((l) => ({
        clientId: l.clientId,
        role: l.role,
        name: nameMap.get(l.clientId) ?? 'Unknown client',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // Resolve active client: explicit selection → first link → null.
  const activeId = session.activeClientId ?? enriched[0]?.clientId ?? null
  const activeLink = activeId
    ? enriched.find((l) => l.clientId === activeId) ?? null
    : null
  const activeCompany: ActiveCompany | null = activeLink
    ? { id: activeLink.clientId, name: activeLink.name, role: activeLink.role }
    : null

  return {
    session,
    links: enriched,
    activeCompany,
    isImpersonating,
    isAdmin: isPortalAdminEmail(session.user.email),
  }
}
