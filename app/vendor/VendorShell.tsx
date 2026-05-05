import Link from 'next/link'
import { getVendorContext } from '@/app/lib/vendor-context'
import { clientAbbrev, clientTint } from '@/app/lib/client-tint'

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/vendor', label: 'Home' },
  { href: '/vendor/purchase-orders', label: 'Purchase orders' },
  { href: '/vendor/rfqs', label: 'RFQs' },
  { href: '/vendor/documents', label: 'Documents' },
  { href: '/vendor/messages', label: 'Messages' },
]

const FOOTER_ITEMS: { href: string; label: string }[] = [
  { href: '/vendor/account', label: 'Account' },
]

/**
 * Vendor-side counterpart to the customer PortalShell. Different nav
 * verbs, separate persona, separate route tree. Reuses the client-tint
 * palette to chip the active vendor (one vendor company per session
 * for v1; multi-vendor support is a future concern).
 */
export async function VendorShell({ children }: { children: React.ReactNode }) {
  const ctx = await getVendorContext()
  if (!ctx) return <>{children}</>

  const { session, activeVendor, links } = ctx
  const tint = activeVendor ? clientTint(activeVendor.id) : null
  const abbrev = activeVendor ? clientAbbrev(activeVendor.name) : 'V'

  return (
    <div className="flex min-h-screen bg-stone-50">
      <aside className="hidden md:flex h-screen sticky top-0 w-64 shrink-0 flex-col gap-3 border-r border-stone-200 bg-white px-3 py-4">
        <div className="px-1 pb-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
            PCC2K · Vendor portal
          </div>
        </div>

        {/* Vendor chip — one per session for v1 */}
        <div className="rounded-md border border-stone-200 bg-white p-2">
          {activeVendor && tint ? (
            <div className="flex items-start gap-2">
              <span
                className={`inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold ring-1 ${tint.bg} ${tint.text} ${tint.ring}`}
              >
                {abbrev}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-stone-800" title={activeVendor.name}>
                  {activeVendor.name}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
                  {activeVendor.role.replace(/_/g, ' ').toLowerCase()}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-stone-500">No vendor linked</div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto" aria-label="Vendor sections">
          <ul>
            {NAV_ITEMS.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className="block rounded-md px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 border-t border-stone-100 pt-3">
            <ul>
              {FOOTER_ITEMS.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="block rounded-md px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="border-t border-stone-100 pt-3">
          <div className="px-2 text-sm text-stone-700">{session.user.name}</div>
          <div className="px-2 truncate text-xs text-stone-500" title={session.user.email}>
            {session.user.email}
          </div>
          <form action="/api/auth/logout" method="post" className="mt-1">
            <button
              type="submit"
              className="block w-full rounded-md px-2 py-1 text-left text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            >
              Sign out
            </button>
          </form>
        </div>

        {links.length === 0 && (
          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
            Your vendor link is missing — ask PCC2K to set it up.
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 md:hidden">
          <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
            PCC2K Vendor
          </div>
          {activeVendor && (
            <div className="ml-auto truncate text-xs text-stone-600" title={activeVendor.name}>
              {activeVendor.name}
            </div>
          )}
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
