import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'
import { prisma } from '@/app/lib/prisma'
import {
  resolveActiveClientId,
  resolveDochubClientName,
} from '@/app/lib/portal-section'

export const dynamic = 'force-dynamic'

// Phase 8 Workstream D step 6.2 — portal-side proxy for the
// "Open a ticket" button on /fleet. Calls FleetHub's
// /api/bff/portal/fleet-open-ticket, which gathers fleet context
// and forwards to TicketHub. Returns { ticketId, ticketNumber }
// for the client to navigate to.

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }
  if (session.aggregateMode) {
    return NextResponse.json(
      { error: 'switch to a single company first' },
      { status: 400 },
    )
  }
  if (session.impersonatedStaffEmail) {
    return NextResponse.json(
      { error: 'read-only — staff tunnel cannot open tickets' },
      { status: 403 },
    )
  }
  const clientId = await resolveActiveClientId(session)
  if (!clientId) {
    return NextResponse.json({ error: 'no active client link' }, { status: 403 })
  }
  const clientName = await resolveDochubClientName(clientId)
  if (!clientName) {
    return NextResponse.json({ error: 'stale client link' }, { status: 403 })
  }

  // The portal user must already be linked to a TicketHub contact —
  // tickets created here must attribute to a real client contact, same
  // rule /tickets/new enforces.
  const link = await prisma.portalUserClientLink.findFirst({
    where: { portalUserId: session.user.id, clientId },
    select: { tickethubContactId: true },
  })
  if (!link?.tickethubContactId) {
    return NextResponse.json(
      { error: "Your portal account isn't linked to a ticket contact yet — email hello@pcc2k.com." },
      { status: 400 },
    )
  }

  let body: { description?: string }
  try {
    body = (await req.json()) as { description?: string }
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const description = body.description?.trim() ?? ''
  if (description.length < 10) {
    return NextResponse.json(
      { error: 'Tell us a bit more (at least 10 characters)' },
      { status: 400 },
    )
  }

  try {
    const r = await signedPost<{ ticketId?: string; ticketNumber?: number; error?: string }>(
      process.env.FLEETHUB_BFF_URL ?? '',
      '/api/bff/portal/fleet-open-ticket',
      {
        portalUserId: session.user.id,
        clientName,
        contactId: link.tickethubContactId,
        description,
      },
    )
    if (!r.ticketId) {
      return NextResponse.json(
        { error: r.error ?? 'could not open ticket' },
        { status: 502 },
      )
    }
    return NextResponse.json({
      ticketId: r.ticketId,
      ticketNumber: r.ticketNumber,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
