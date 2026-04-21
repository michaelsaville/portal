import Link from 'next/link'

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
 */
export default function PortalSection({
  title,
  subtitle,
  error,
  backHref = '/',
  backLabel = '← back',
  maxWidth = 'max-w-5xl',
  children,
}: Props) {
  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className={`${maxWidth} mx-auto`}>
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
            )}
          </div>
          <Link href={backHref} className="text-sm text-stone-600 hover:text-stone-800">
            {backLabel}
          </Link>
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
 * Shown when PortalUserClientLink has no rows for this user — most
 * common for invitees whose link hasn't been set up yet.
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
 * Different semantic from NotLinkedYet — the link is fine, the data is
 * just empty.
 */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
      {children}
    </div>
  )
}
