import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { prisma } from '@/app/lib/prisma'
import { signedPost } from '@/app/lib/bff-client'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const runtime = 'nodejs'

interface CreateResponse {
  ok: boolean
  ticketId?: string
  ticketNumber?: number
  error?: string
}

/**
 * Open a new ticket on behalf of the signed-in portal user against
 * the active client. Aggregate mode is rejected — the user must pick
 * a single company first because the new ticket has to land on one.
 *
 * The TH BFF handles validation that the contactId actually belongs
 * to the resolved client; here we just plumb the right ids through.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.aggregateMode) {
    return NextResponse.json(
      { error: 'Pick a single company before opening a new ticket.' },
      { status: 400 },
    )
  }

  const activeClientId = await resolveActiveClientId(session)
  if (!activeClientId) {
    return NextResponse.json({ error: 'No linked company' }, { status: 400 })
  }

  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId: activeClientId },
    select: { tickethubContactId: true },
  })
  if (!link) {
    return NextResponse.json({ error: 'Not linked' }, { status: 403 })
  }
  if (!link.tickethubContactId) {
    return NextResponse.json(
      {
        error:
          "We haven't matched your portal account to a contact in our ticket system yet. PCC2K needs to link them before you can open a ticket here.",
      },
      { status: 400 },
    )
  }

  const clientName = await resolveDochubClientName(activeClientId)
  if (!clientName) {
    return NextResponse.json(
      { error: 'Stale link — contact PCC2K' },
      { status: 400 },
    )
  }

  let body: { title?: string; description?: string }
  try {
    body = (await req.json()) as { title?: string; description?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const title = body.title?.trim() ?? ''
  const description = body.description?.trim() ?? ''
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (title.length > 200) {
    return NextResponse.json(
      { error: 'Title is too long (200 char max)' },
      { status: 400 },
    )
  }

  // Block staff-impersonation tunnels from creating tickets (read-only mode).
  if (session.impersonatedStaffEmail) {
    return NextResponse.json(
      { error: 'Read-only — staff tunnel cannot open tickets.' },
      { status: 403 },
    )
  }

  try {
    const r = await signedPost<CreateResponse>(
      process.env.TICKETHUB_BFF_URL ?? '',
      '/api/bff/portal/tickethub/tickets/create',
      {
        clientName,
        contactId: link.tickethubContactId,
        title,
        description,
      },
    )
    if (!r.ok || !r.ticketId) {
      return NextResponse.json(
        { error: r.error ?? 'Could not open ticket' },
        { status: 502 },
      )
    }
    return NextResponse.json({
      ticketId: r.ticketId,
      ticketNumber: r.ticketNumber,
    })
  } catch (e) {
    console.error('[portal/tickets create]', e)
    return NextResponse.json({ error: 'Could not open ticket' }, { status: 502 })
  }
}
