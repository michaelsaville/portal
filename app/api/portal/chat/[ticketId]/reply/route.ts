import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

/**
 * Client-callable POST that mirrors the existing server-action
 * `replyAction` but returns JSON instead of revalidating the page —
 * needed so the chat panel can append + re-poll without a full SSR
 * round-trip.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  if (session.impersonatedStaffEmail) {
    return NextResponse.json(
      { ok: false, error: 'staff impersonation is read-only' },
      { status: 403 },
    )
  }

  let body: string
  try {
    const payload = await req.json()
    body = (payload?.body ?? '').toString().trim()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON body' },
      { status: 400 },
    )
  }
  if (!body) {
    return NextResponse.json(
      { ok: false, error: 'body required' },
      { status: 400 },
    )
  }
  if (body.length > 20_000) {
    return NextResponse.json(
      { ok: false, error: 'body too long (max 20KB)' },
      { status: 400 },
    )
  }

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) {
    return NextResponse.json(
      { ok: false, error: 'no client' },
      { status: 404 },
    )
  }
  const clientName = await resolveDochubClientName(activeClientId)
  if (!clientName) {
    return NextResponse.json(
      { ok: false, error: 'client name unresolved' },
      { status: 500 },
    )
  }

  try {
    await signedPost(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/tickets/reply',
      {
        clientName,
        ticketId,
        body,
        authorName: session.user.name,
        authorEmail: session.user.email,
        clientOpId: `portal-chat:${session.user.id}:${Date.now()}`,
      },
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'upstream error',
      },
      { status: 502 },
    )
  }
}
