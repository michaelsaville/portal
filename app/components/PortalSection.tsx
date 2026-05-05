import { getPortalContext } from '@/app/lib/portal-context'

interface Props {
  title: string
  /** Shown beneath the title; falsy values render nothing. */
  subtitle?: string | null
  /** Error banner at the top of the body; falsy values render nothing. */
  error?: string | null
  /** When set, a small back-link renders above the title (detail → list). */
  backHref?: string
  backLabel?: string
  /** Right-aligned header content — typically a primary action button. */
  actions?: React.ReactNode
  /** Max body width class. Defaults to `max-w-5xl`. */
  maxWidth?: string
  children: React.ReactNode
}

/**
 * Shared content chrome for portal sections — title, subtitle, error
 * banner. Sits inside the global PortalShell which provides the
 * sidebar, company switcher, and mobile drawer; this component is
 * scoped to the page body.
 *
 * The active-company name is auto-prefixed onto the subtitle (e.g.
 * "Queen City Motors · 5 awaiting your review") as one of the three
 * defenses-in-depth cues for multi-company users — sidebar chip,
 * subtitle prefix, and (later) browser title.
 */
export default async function PortalSection({
  title,
  subtitle,
  error,
  backHref,
  backLabel = '← back',
  actions,
  maxWidth = 'max-w-5xl',
  children,
}: Props) {
  const ctx = await getPortalContext()
  const activeName = ctx?.activeCompany?.name ?? null
  const showPrefix = !!activeName && (ctx?.links.length ?? 0) > 1
  const finalSubtitle = subtitle
    ? showPrefix
      ? `${activeName} · ${subtitle}`
      : subtitle
    : showPrefix
      ? activeName
      : null

  return (
    <div className="p-6 sm:p-10">
      <div className={`${maxWidth} mx-auto`}>
        {backHref && (
          <a
            href={backHref}
            className="mb-2 inline-block text-sm text-stone-500 hover:text-stone-800"
          >
            {backLabel}
          </a>
        )}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">{title}</h1>
            {finalSubtitle && (
              <p className="mt-1 text-sm text-stone-600">{finalSubtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {children}
      </div>
    </div>
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
