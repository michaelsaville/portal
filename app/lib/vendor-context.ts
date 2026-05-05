import 'server-only'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession, type ResolvedSession } from '@/app/lib/portal-auth'

export interface VendorLink {
  vendorId: string
  name: string
  role: string
}

export interface ActiveVendor {
  id: string
  name: string
  role: string
}

export interface VendorContext {
  session: ResolvedSession
  links: VendorLink[]
  activeVendor: ActiveVendor | null
}

/**
 * Resolve everything a vendor-portal page needs to render. Enforces
 * the persona invariant — customer sessions on a vendor route get
 * sent to /vendor/login. Returns null when there's no signed-in
 * vendor session at all (caller decides whether to redirect to
 * login or render an unauthenticated screen).
 */
export async function getVendorContext(): Promise<VendorContext | null> {
  const session = await getSession()
  if (!session) return null
  if (session.user.persona !== 'VENDOR') {
    // Customer logged into the vendor host — bounce them with a
    // wrong-portal hint. Don't log out their customer session; they
    // still have a customer account.
    redirect('/vendor/login?wrong-portal=1')
  }

  type RawLink = { vendorId: string; role: string }
  const links = (await prisma.portalUserVendorLink.findMany({
    where: { portalUserId: session.user.id },
    select: { vendorId: true, role: true },
    orderBy: { createdAt: 'asc' },
  })) as RawLink[]

  let enriched: VendorLink[] = []
  if (links.length > 0) {
    const ids = links.map((l: RawLink) => l.vendorId)
    // TH_Vendor lives in tickethub schema; raw query gets the names.
    const rows = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
      `SELECT id, name FROM tickethub.th_vendors WHERE id = ANY($1::text[])`,
      ids,
    )
    const nameMap = new Map<string, string>(rows.map((r) => [r.id, r.name]))
    enriched = links
      .map((l: RawLink) => ({
        vendorId: l.vendorId,
        role: l.role,
        name: nameMap.get(l.vendorId) ?? 'Unknown vendor',
      }))
      .sort((a: VendorLink, b: VendorLink) => a.name.localeCompare(b.name))
  }

  const activeId = session.activeVendorId ?? enriched[0]?.vendorId ?? null
  const activeLink = activeId
    ? enriched.find((l) => l.vendorId === activeId) ?? null
    : null
  const activeVendor: ActiveVendor | null = activeLink
    ? { id: activeLink.vendorId, name: activeLink.name, role: activeLink.role }
    : null

  return { session, links: enriched, activeVendor }
}

/** Server-component shorthand: redirect to vendor login if no session,
 *  otherwise return the context. */
export async function requireVendorSession(): Promise<VendorContext> {
  const ctx = await getVendorContext()
  if (!ctx) redirect('/vendor/login')
  return ctx
}
