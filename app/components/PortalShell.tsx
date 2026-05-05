import { getPortalContext } from '@/app/lib/portal-context'
import PortalSidebar from './PortalSidebar'
import MobileDrawer from './MobileDrawer'

/**
 * Layout shell: persistent left sidebar on `md:` and up, hamburger
 * drawer below. Passes through to children unchanged when there is no
 * portal session — so /login and /invite render their own full-bleed
 * layouts without wrapping.
 */
export default async function PortalShell({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalContext()

  if (!ctx) {
    // Anonymous routes (login, invite, marketing) — pass through.
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <PortalSidebar ctx={ctx} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — hamburger toggle + brand cue + active company */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 md:hidden">
          <MobileDrawer>
            <PortalSidebar ctx={ctx} />
          </MobileDrawer>
          <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
            PCC2K Portal
          </div>
          {ctx.aggregate.active ? (
            <div className="ml-auto text-xs text-stone-600">
              All companies · {ctx.aggregate.count}
            </div>
          ) : ctx.activeCompany ? (
            <div className="ml-auto truncate text-xs text-stone-600" title={ctx.activeCompany.name}>
              {ctx.activeCompany.name}
            </div>
          ) : null}
        </header>

        {/* Aggregate-mode chrome strip (rendered on every page) */}
        {ctx.aggregate.active && (
          <div
            className="border-b border-stone-200 px-4 py-2 text-xs text-stone-700"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, #f5f5f4 0 8px, #fafaf9 8px 16px)',
            }}
          >
            <span className="font-medium">Aggregate view</span> across {ctx.aggregate.count}{' '}
            companies — Tickets and Invoices fan out across every linked company.
            Other sections need a single company; pick one from the switcher to view.
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
