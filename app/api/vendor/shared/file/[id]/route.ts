import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { getSession } from '@/app/lib/portal-auth'
import { getVendorGrants, resolveActiveGrant } from '@/app/lib/dochub-vendor'

export const dynamic = 'force-dynamic'

/**
 * Vendor-gated DocHub file proxy. Validates the VENDOR session + that the
 * requested client (query ?client=) is an active grant, then signs a POST to
 * DocHub's vendor file BFF — which re-verifies the file is actually shared
 * with this vendor and streams the bytes. We relay the stream + the content
 * headers DocHub set (it owns the inline-vs-attachment decision).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.user.persona !== 'VENDOR') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const clientId = req.nextUrl.searchParams.get('client') ?? ''
  const grants = await getVendorGrants(session.user.id)
  const grant = resolveActiveGrant(grants, clientId)
  if (!grant || !clientId || grant.clientId !== clientId) {
    return NextResponse.json({ error: 'no access to this client' }, { status: 403 })
  }

  const base = process.env.DOCHUB_BFF_URL
  const secret = process.env.PORTAL_BFF_SECRET
  if (!base || !secret) return NextResponse.json({ error: 'BFF not configured' }, { status: 500 })

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1'
  const body = JSON.stringify({
    vendorId: grant.dochubVendorId,
    clientId: grant.clientId,
    attachmentId: id,
    disposition: wantsDownload ? 'attachment' : 'inline',
  })
  const ts = Date.now().toString()
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  const upstream = await fetch(`${base.replace(/\/+$/, '')}/api/bff/portal/dochub/vendor/file`, {
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
  for (const name of ['content-type', 'content-length', 'content-disposition']) {
    const v = upstream.headers.get(name)
    if (v) headers.set(name, v)
  }
  headers.set('Cache-Control', 'private, no-store')
  return new NextResponse(upstream.body, { status: 200, headers })
}
