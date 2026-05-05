import Link from 'next/link'
import { getSession } from '@/app/lib/portal-auth'
import { getPortalContext } from '@/app/lib/portal-context'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100 text-stone-800">
        <div className="max-w-xl text-center space-y-6">
          <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
            PCC2K · portal.pcc2k.com
          </div>
          <h1 className="font-serif text-4xl font-bold">Client Portal</h1>
          <p className="text-stone-600 leading-relaxed">
            A unified home for everything we manage on your behalf — docs,
            assets, and licenses, plus tickets, estimates, and invoices. One
            login. One place.
          </p>
          <div>
            <Link
              href="/login"
              className="inline-block rounded-md bg-stone-800 text-white text-sm font-medium px-5 py-2.5 hover:bg-stone-700 transition-colors"
            >
              Sign in
            </Link>
          </div>
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

  const ctx = await getPortalContext()
  const firstName = session.user.name.split(' ')[0]
  const activeName = ctx?.activeCompany?.name ?? null

  return (
    <div className="p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Welcome back, {firstName}.
          </h1>
          {activeName && (
            <p className="mt-1 text-sm text-stone-600">{activeName}</p>
          )}
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <HomeCard
            href="/account"
            title="Account"
            blurb="Balance, payments, and aging"
          />
          <HomeCard
            href="/tickets"
            title="Tickets"
            blurb="Open requests and history"
          />
          <HomeCard
            href="/invoices"
            title="Invoices"
            blurb="Open balances and recent payments"
          />
          <HomeCard
            href="/estimates"
            title="Estimates"
            blurb="Awaiting your review"
          />
          <HomeCard
            href="/documents"
            title="Documents"
            blurb="Reports, agreements, runbooks"
          />
          <HomeCard
            href="/assets"
            title="Assets"
            blurb="Managed devices and equipment"
          />
        </div>

        <div className="mt-6 text-xs text-stone-500">
          Use the sidebar to reach any section. Questions?{' '}
          <a href="mailto:hello@pcc2k.com" className="underline hover:text-stone-700">
            hello@pcc2k.com
          </a>
        </div>
      </div>
    </div>
  )
}

function HomeCard({
  href,
  title,
  blurb,
}: {
  href: string
  title: string
  blurb: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50"
    >
      <div className="font-serif text-base font-semibold text-stone-800">{title}</div>
      <div className="mt-1 text-xs text-stone-600">{blurb}</div>
    </Link>
  )
}
