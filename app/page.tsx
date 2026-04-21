import Link from 'next/link'
import { getSession } from '@/app/lib/portal-auth'
import { isPortalAdminEmail } from '@/app/lib/portal-admin'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  const isAdmin = isPortalAdminEmail(session?.user.email)

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100 text-stone-800">
      <div className="max-w-xl text-center space-y-6">
        <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
          PCC2K · portal.pcc2k.com
        </div>
        <h1 className="font-serif text-4xl font-bold">
          {session ? `Welcome back, ${session.user.name.split(' ')[0]}.` : 'Client Portal'}
        </h1>

        {session ? (
          <>
            <p className="text-stone-600 leading-relaxed">
              Everything we keep on file for your organization, in one
              place.
            </p>
            <nav className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { href: '/assets', label: 'Assets' },
                { href: '/documents', label: 'Documents' },
                { href: '/licenses', label: 'Licenses' },
                { href: '/contacts', label: 'Contacts' },
                { href: '/locations', label: 'Locations' },
                { href: '/domains', label: 'Domains' },
              ].map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="rounded-md border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  {s.label}
                </Link>
              ))}
            </nav>
            {isAdmin && (
              <div className="flex gap-2 justify-center flex-wrap">
                <Link
                  href="/admin/users"
                  className="inline-block rounded-md border border-stone-300 bg-white text-sm font-medium px-4 py-2 text-stone-700 hover:bg-stone-100"
                >
                  Manage users
                </Link>
                <Link
                  href="/admin/messages"
                  className="inline-block rounded-md border border-stone-300 bg-white text-sm font-medium px-4 py-2 text-stone-700 hover:bg-stone-100"
                >
                  Messages
                </Link>
              </div>
            )}
            <form action="/api/auth/logout" method="post" className="pt-2">
              <button
                type="submit"
                className="text-xs text-stone-500 hover:text-stone-700 underline"
              >
                sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-stone-600 leading-relaxed">
              A unified home for everything we manage on your behalf — the
              docs, assets, and licenses from DocHub, plus tickets,
              estimates, and invoices from TicketHub. One login. One place.
            </p>
            <div>
              <Link
                href="/login"
                className="inline-block rounded-md bg-stone-800 text-white text-sm font-medium px-5 py-2.5 hover:bg-stone-700 transition-colors"
              >
                Sign in
              </Link>
            </div>
          </>
        )}

        <div className="text-xs text-stone-500">
          Questions?{' '}
          <Link href="mailto:hello@pcc2k.com" className="underline hover:text-stone-700">
            hello@pcc2k.com
          </Link>
        </div>
      </div>
    </main>
  )
}
