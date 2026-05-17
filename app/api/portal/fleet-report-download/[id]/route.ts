import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

// Phase 8 Workstream D step 6.2 — portal-side proxy that turns a
// stable, session-authed URL into a fresh signed FleetHub download
// URL. Each click mints a new 5-minute token via the BFF and 302s
// to it. Deliberately a 302 (not a streamed proxy) so the actual
// PDF/ZIP body travels straight from FleetHub to the browser — no
// portal bandwidth, no double-decode.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }
  const { id } = await params

  const clientId = await resolveActiveClientId(session)
  if (!clientId) {
    return NextResponse.json({ error: 'no active client link' }, { status: 403 })
  }
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return NextResponse.json({ error: 'stale client link' }, { status: 403 })
  }

  try {
    const res = await signedPost<{ url: string; expiresAt: number }>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/fleet-report-download',
      { portalUserId: session.user.id, clientName, reportId: id },
    )
    return NextResponse.redirect(res.url, { status: 302 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Surface a small error page rather than a JSON blob — the
    // caller here is a browser navigation, not an XHR.
    return new NextResponse(
      `<!doctype html><html><body style="font-family:system-ui;padding:40px;text-align:center;color:#7f1d1d">
         <h1 style="font-size:18px">Couldn't mint download URL</h1>
         <p style="font-size:14px;color:#57534e">${escapeHtml(msg)}</p>
         <p style="font-size:13px"><a href="/fleet/reports" style="color:#2563eb">← back to reports</a></p>
       </body></html>`,
      { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
