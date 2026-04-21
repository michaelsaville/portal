import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import ClientSwitcher from './ClientSwitcher'

interface Props {
  title: string
  /** Shown beneath the title; falsy values render nothing. */
  subtitle?: string | null
  /** Error banner at the top of the body; falsy values render nothing. */
  error?: string | null
  /** Back-link destination. Defaults to "/" (portal home). */
  backHref?: string
  /** Back-link label. */
  backLabel?: string
  /** Max body width class. Defaults to `max-w-5xl`. */
  maxWidth?: string
  children: React.ReactNode
}

/**
 * Shared page chrome for portal sections. Nine+ pages duplicated this
 * header/back-link/error pattern before the extraction; new sections
 * should prefer this over re-templating.
 *
 * Async so we can render the ClientSwitcher for users with multiple
 * PortalUserClientLink rows. Single-link users pay zero UI cost (the
 * switcher falls back to null).
 */
export default async function PortalSection({
  title,
  subtitle,
  error,
  backHref = '/',
  backLabel = '← back',
  maxWidth = 'max-w-5xl',
  children,
}: Props) {
  const session = await getSession()
  let switcher: React.ReactNode = null
  if (session) {
    const links = await prisma.portalUserClientLink.findMany({
      where: { portalUserId: session.user.id },
      select: { clientId: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    if (links.length > 1) {
      // Same-DB raw query — DocHub's public schema isn't in the portal's
      // `schemas` list, but Client rows live next door. Prisma tagged
      // templates don't accept array params cleanly, so use the
      // Postgres ANY($1::text[]) form via $queryRawUnsafe.
      const ids = links.map((l) => l.clientId)
      const rows = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
        `SELECT id, name FROM public."Client" WHERE id = ANY($1::text[])`,
        ids,
      )
      const nameMap = new Map<string, string>(rows.map((r) => [r.id, r.name]))
      const enriched = links
        .map((l) => ({
          clientId: l.clientId,
          role: l.role,
          name: nameMap.get(l.clientId) ?? 'Unknown client',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const activeId = session.activeClientId ?? enriched[0]?.clientId ?? ''
      switcher = <ClientSwitcher links={enriched} activeClientId={activeId} />
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className={`${maxWidth} mx-auto`}>
        <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {switcher}
            <Link href={backHref} className="text-sm text-stone-600 hover:text-stone-800">
              {backLabel}
            </Link>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {children}
      </div>
    </main>
  )
}

/**
 * Standardized "your account isn't linked to a client" empty state.
 */
export function NotLinkedYet({ title }: { title: string }) {
  return (
    <PortalSection title={title}>
      <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
        Your account isn't linked to a client yet. Ask PCC2K to set that up.
      </p>
    </PortalSection>
  )
}

/**
 * Dashed empty state for "this client has nothing in this section yet."
 */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
      {children}
    </div>
  )
}
