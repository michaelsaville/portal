import Link from 'next/link'
import CompanySwitcher from './CompanySwitcher'
import CompanyChip from './CompanyChip'
import type { PortalContext } from '@/app/lib/portal-context'

interface SectionItem {
  href: string
  label: string
}
interface SectionGroup {
  label: string | null
  items: SectionItem[]
}

const ACTIVE_GROUP: SectionItem[] = [
  { href: '/', label: 'Home' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/estimates', label: 'Estimates' },
]

const DOCUMENTATION_GROUP: SectionItem[] = [
  { href: '/documents', label: 'Documents' },
  { href: '/assets', label: 'Assets' },
  { href: '/licenses', label: 'Licenses' },
  { href: '/domains', label: 'Domains' },
  { href: '/locations', label: 'Locations' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/vault', label: 'Vault' },
]

const FOOTER_GROUP: SectionItem[] = [
  { href: '/account', label: 'Account' },
]

const ADMIN_ITEMS: SectionItem[] = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/messages', label: 'Messages' },
]

export default function PortalSidebar({ ctx }: { ctx: PortalContext }) {
  const { session, links, activeCompany, isImpersonating, isAdmin } = ctx

  const groups: SectionGroup[] = [
    { label: null, items: ACTIVE_GROUP },
    { label: 'Documentation', items: DOCUMENTATION_GROUP },
    { label: null, items: FOOTER_GROUP },
  ]

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-3 border-r border-stone-200 bg-white px-3 py-4">
      {/* Brand */}
      <div className="px-1 pb-1">
        <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
          PCC2K
        </div>
        <div className="font-serif text-base font-bold text-stone-800">
          Client Portal
        </div>
      </div>

      {/* Company chip / switcher */}
      <div>
        {isImpersonating && activeCompany ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
            <CompanyChip
              clientId={activeCompany.id}
              name={activeCompany.name}
              role="IMPERSONATED"
            />
          </div>
        ) : links.length > 0 ? (
          <CompanySwitcher
            links={links}
            activeClientId={activeCompany?.id ?? links[0]!.clientId}
          />
        ) : (
          <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-2 text-xs text-stone-500">
            No companies linked yet.
          </div>
        )}
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto" aria-label="Portal sections">
        {groups.map((g, i) => (
          <div key={i} className={i === 0 ? '' : 'mt-3 border-t border-stone-100 pt-3'}>
            {g.label && (
              <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-stone-400">
                {g.label}
              </div>
            )}
            <ul>
              {g.items.map((it) => (
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
        ))}

        {isAdmin && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-stone-400">
              Admin
            </div>
            <ul>
              {ADMIN_ITEMS.map((it) => (
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
        )}
      </nav>

      {/* User footer */}
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
    </aside>
  )
}
