import { NextResponse, type NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'
import { getSession } from '@/app/lib/portal-auth'
import { resolveActiveClientId, resolveDochubClientName } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

/**
 * Portal-gated attachment proxy. Validates session + active client,
 * then signs a POST to TicketHub's attachments/download BFF which
 * re-verifies ownership and streams the bytes back. Portal relays
 * that stream to the browser.
 *
 * Streaming the body directly avoids buffering the whole file in
 * memory on the portal container.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) return NextResponse.json({ error: 'no client link' }, { status: 403 })

  const clientName = await resolveDochubClientName(activeClientId)
  if (!clientName) return NextResponse.json({ error: 'stale client link' }, { status: 404 })

  const base = process.env.TICKETHUB_BFF_URL
  const secret = process.env.PORTAL_BFF_SECRET
  if (!base || !secret) return NextResponse.json({ error: 'BFF not configured' }, { status: 500 })

  const body = JSON.stringify({ clientName, attachmentId: id })
  const ts = Date.now().toString()
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  const upstream = await fetch(`${base.replace(/\/+$/, '')}/api/bff/portal/tickethub/attachments/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Portal-Timestamp': ts,
      'X-Portal-Signature': `sha256=${sig}`,
    },
    body,
    cache: 'no-store',
  })

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return NextResponse.json(
      { error: `upstream ${upstream.status}`, detail: text.slice(0, 200) },
      { status: upstream.status },
    )
  }

  const headers = new Headers()
  const passthrough = ['content-type', 'content-length', 'content-disposition']
  for (const name of passthrough) {
    const v = upstream.headers.get(name)
    if (v) headers.set(name, v)
  }
  headers.set('Cache-Control', 'private, no-store')

  return new NextResponse(upstream.body, { status: 200, headers })
}
