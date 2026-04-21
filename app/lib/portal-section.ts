import 'server-only'
import { prisma } from '@/app/lib/prisma'
import type { getSession } from '@/app/lib/portal-auth'

type ResolvedSession = NonNullable<Awaited<ReturnType<typeof getSession>>>

/**
 * Figure out which DocHub client the current portal session should be
 * viewing. Prefers `session.activeClientId`, falls back to the user's
 * oldest `PortalUserClientLink`, returns null when the user has no
 * linked clients at all. Null means "show the not-linked empty state,"
 * not an error.
 */
export async function resolveActiveClientId(
  session: ResolvedSession,
): Promise<string | null> {
  if (session.activeClientId) return session.activeClientId
  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id },
    select: { clientId: true },
    orderBy: { createdAt: 'asc' },
  })
  return link?.clientId ?? null
}

/**
 * Look up the DocHub Client.name for a given DocHub Client.id via raw
 * SQL. Portal's Prisma client doesn't know about the `public` schema,
 * but it's the same Postgres so `$queryRaw` works. Returns null if the
 * row's gone — treat as a stale link (tell the user).
 *
 * Needed for TicketHub BFF calls: TH_Client is matched by name since
 * PortalUserClientLink tracks DocHub ids only.
 */
export async function resolveDochubClientName(
  clientId: string,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM public."Client" WHERE id = ${clientId} LIMIT 1
  `
  return rows[0]?.name ?? null
}
