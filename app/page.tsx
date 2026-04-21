import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-stone-50 to-stone-100 text-stone-800">
      <div className="max-w-xl text-center space-y-6">
        <div className="text-sm font-mono tracking-widest uppercase text-stone-500">
          PCC2K · portal.pcc2k.com
        </div>
        <h1 className="font-serif text-4xl font-bold">
          Client Portal
        </h1>
        <p className="text-stone-600 leading-relaxed">
          A unified home for everything we manage on your behalf — the
          docs, assets, and licenses from DocHub, plus tickets, estimates,
          and invoices from TicketHub. One login. One place.
        </p>
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-left text-sm text-stone-600 leading-relaxed">
          <strong className="font-semibold text-stone-800">Under construction.</strong>{' '}
          Phase 1 identity foundation is landing. If you already use
          DocHub&apos;s client portal, we&apos;ll email you a migration
          link when the switchover&apos;s ready.
        </div>
        <div className="text-xs text-stone-500">
          Questions?{' '}
          <Link
            href="mailto:hello@pcc2k.com"
            className="underline hover:text-stone-700"
          >
            hello@pcc2k.com
          </Link>
        </div>
      </div>
    </main>
  )
}
