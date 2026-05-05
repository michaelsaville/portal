import PortalSection from './PortalSection'

/**
 * Drop-in stub for section pages that can't aggregate cleanly across
 * companies — assets, vault, contacts, documents, licenses, locations,
 * domains, estimates, account, pending. Renders inside the portal
 * shell so the sidebar (with the company switcher pinned at the top)
 * is the path forward; we don't link to a separate switch page.
 */
export default function AggregateNotSupported({
  title,
  blurb,
}: {
  title: string
  /** Short copy explaining why this section is single-company. */
  blurb?: string
}) {
  return (
    <PortalSection
      title={title}
      subtitle={blurb ?? 'Pick a single company to view this section.'}
    >
      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
        <p className="text-sm text-stone-700">
          {title} is a per-company view.
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Use the company switcher at the top of the sidebar to pick one.
        </p>
      </div>
    </PortalSection>
  )
}
