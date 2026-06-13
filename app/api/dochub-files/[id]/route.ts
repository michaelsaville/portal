import { NextResponse, type NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'
import { getSession } from '@/app/lib/portal-auth'
import { resolveActiveClientId } from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

/**
 * Portal-gated DocHub file proxy. Validates the portal session + active client,
 * then signs a POST to DocHub's files BFF, which re-verifies the file is shared
 * to this client (portalVisible, or its parent document is) and streams the
 * bytes. The portal relays that stream to the browser without buffering it.
 *
 * DocHub's BFF decides inline vs attachment via its own allow-list (images /
 * pdf / text inline; everything else forced to download); `?download=1` here
 * asks for an attachment regardless. clientId is the DocHub Client.id —
 * resolveActiveClientId returns exactly that — unlike the TicketHub attachment
 * proxy, which matches TH_Client by name.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  const clientId = await resolveActiveClientId(session)
  if (!clientId) return NextResponse.json({ error: 'no client link' }, { status: 403 })

  const base = process.env.DOCHUB_BFF_URL
  const secret = process.env.PORTAL_BFF_SECRET
  if (!base || !secret) return NextResponse.json({ error: 'BFF not configured' }, { status: 500 })

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1'
  const body = JSON.stringify({
    clientId,
    portalUserId: session.user.id,
    disposition: wantsDownload ? 'attachment' : 'inline',
  })
  const ts = Date.now().toString()
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  const upstream = await fetch(
    `${base.replace(/\/+$/, '')}/api/bff/portal/dochub/files/${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Timestamp': ts,
        'X-Portal-Signature': `sha256=${sig}`,
      },
      body,
      cache: 'no-store',
    },
  )

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return NextResponse.json(
      { error: `upstream ${upstream.status}`, detail: text.slice(0, 200) },
      { status: upstream.status },
    )
  }

  // Relay the file stream + the content headers the BFF already set (it owns
  // the inline-safety + Content-Disposition decision).
  const headers = new Headers()
  for (const name of ['content-type', 'content-length', 'content-disposition']) {
    const v = upstream.headers.get(name)
    if (v) headers.set(name, v)
  }
  headers.set('Cache-Control', 'private, no-store')

  return new NextResponse(upstream.body, { status: 200, headers })
}
