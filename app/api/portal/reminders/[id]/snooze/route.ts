import { NextRequest, NextResponse } from 'next/server'
import { requirePendingActor, reminderBff } from '../../_helpers'

export const runtime = 'nodejs'

interface SnoozeResponse {
  ok: boolean
  snoozedUntil?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePendingActor()
  if (gate.ok === 'no-mapping') {
    return NextResponse.json({ error: 'Not linked' }, { status: 403 })
  }
  if (!gate.ok) return gate.res
  const { id } = await params
  let days = 3
  try {
    const body = (await req.json()) as { days?: number }
    if (typeof body?.days === 'number') days = body.days
  } catch {
    // No body — use the default.
  }
  try {
    const r = await reminderBff<SnoozeResponse>('snooze', {
      reminderId: id,
      contactId: gate.actor.contactId,
      days,
    })
    return NextResponse.json({ ok: true, snoozedUntil: r.snoozedUntil })
  } catch (e) {
    console.error('[portal/reminders snooze]', e)
    return NextResponse.json({ error: 'Snooze failed' }, { status: 502 })
  }
}
