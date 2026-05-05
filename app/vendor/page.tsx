import Link from 'next/link'
import { requireVendorSession } from '@/app/lib/vendor-context'
import { signedPost } from '@/app/lib/bff-client'
import { Card } from '@/app/components/ui/Card'

export const dynamic = 'force-dynamic'

interface POSummary {
  awaitingAcceptance: number
  totalOpenCents: number
}

interface SummaryResponse {
  ok: boolean
  poSummary?: POSummary
  error?: string
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default async function VendorHomePage() {
  const ctx = await requireVendorSession()
  const firstName = ctx.session.user.name.split(' ')[0]

  let summary: POSummary | null = null
  let summaryError: string | null = null

  if (ctx.activeVendor) {
    try {
      const r = await signedPost<SummaryResponse>(
        process.env.TICKETHUB_BFF_URL ?? '',
        '/api/bff/portal/tickethub/vendor/summary',
        { vendorId: ctx.activeVendor.id },
      )
      summary = r.poSummary ?? null
    } catch (e) {
      summaryError = e instanceof Error ? e.message : 'Could not load summary'
    }
  }

  return (
    <div className="p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-stone-800">
            Welcome back, {firstName}.
          </h1>
          {ctx.activeVendor && (
            <p className="mt-1 text-sm text-stone-600">
              {ctx.activeVendor.name}
            </p>
          )}
        </header>

        {!ctx.activeVendor && (
          <Card tone="warning" padding="md" className="mb-6">
            <p className="text-sm text-amber-900">
              Your account isn't linked to a vendor record yet. Email{' '}
              <a className="underline" href="mailto:hello@pcc2k.com">
                hello@pcc2k.com
              </a>{' '}
              and we'll set that up.
            </p>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            href="/vendor/purchase-orders"
            title="Purchase orders"
            primary={
              summary
                ? `${summary.awaitingAcceptance} awaiting acceptance`
                : '—'
            }
            secondary={
              summary && summary.totalOpenCents > 0
                ? money(summary.totalOpenCents) + ' open'
                : 'Inbound POs from PCC2K'
            }
            error={summaryError}
          />
          <SummaryCard
            href="/vendor/rfqs"
            title="RFQs"
            primary="—"
            secondary="Price requests (coming soon)"
          />
          <SummaryCard
            href="/vendor/documents"
            title="Documents"
            primary="—"
            secondary="W-9, COI, agreements (coming soon)"
          />
        </div>

        <p className="mt-6 text-xs text-stone-500">
          The vendor portal is freshly minted (Phase 7). RFQs, document
          uploads, and messaging are on the roadmap. Email PCC2K if you
          need something we don't surface here yet.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({
  href,
  title,
  primary,
  secondary,
  error,
}: {
  href: string
  title: string
  primary: string
  secondary: string
  error?: string | null
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50"
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
        {title}
      </div>
      <div className="mt-1 font-serif text-xl font-semibold text-stone-800">
        {primary}
      </div>
      <div className="mt-1 text-xs text-stone-600">{secondary}</div>
      {error && (
        <div className="mt-2 text-[11px] text-rose-700">Could not load: {error}</div>
      )}
    </Link>
  )
}
