import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

interface MultiPayResponse {
  ok: boolean
  url?: string
  invoiceCount?: number
  totalCents?: number
  error?: string
}

/**
 * Portal proxy: signs a TicketHub BFF call to mint a Stripe Payment
 * Link covering the selected invoice IDs. Returns the URL to the
 * client which then redirects the browser to Stripe.
 *
 * Session-gated; impersonation is allowed to look (the session is
 * valid) but Stripe payments from impersonation are intentionally
 * blocked at the page level — no need to duplicate that gate here.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { invoiceIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const ids = Array.isArray(body.invoiceIds)
    ? body.invoiceIds.filter((x): x is string => typeof x === 'string')
    : []
  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'invoiceIds required' },
      { status: 400 },
    )
  }

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) {
    return NextResponse.json({ error: 'no client link' }, { status: 403 })
  }
  const clientName = await resolveDochubClientName(activeClientId)
  if (!clientName) {
    return NextResponse.json({ error: 'stale client link' }, { status: 404 })
  }

  try {
    const data = await signedPost<MultiPayResponse>(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/multi-invoice-pay-link',
      { clientName, invoiceIds: ids },
    )
    if (!data.ok || !data.url) {
      return NextResponse.json(
        { error: data.error ?? 'failed to mint link' },
        { status: 500 },
      )
    }
    return NextResponse.json({
      ok: true,
      url: data.url,
      invoiceCount: data.invoiceCount,
      totalCents: data.totalCents,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'BFF call failed' },
      { status: 500 },
    )
  }
}
