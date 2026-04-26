import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

/**
 * Polling endpoint for the portal chat panel. Session-gated; resolves the
 * active client + DocHub client name, then signs a request to TH's
 * lightweight `tickets/messages` BFF.
 *
 * Returns the same shape TH returns so the client can use it directly.
 * Errors out with 401 / 404 / 500 — never with HTML — so the client
 * polling loop can render a discreet error chip without surprises.
 */
export async function GET(
  _req: NextRequest,
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
    const data = await signedPost<{
      ok: boolean
      ticket: {
        id: string
        status: string
        updatedAt: string
        assignedTo: { name: string } | null
      }
      comments: Array<{
        id: string
        body: string
        createdAt: string
        author: { name: string }
      }>
    }>(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/tickets/messages',
      { clientName, ticketId },
    )
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
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
