import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/portal-auth'
import { requirePendingActor, reminderBff } from '../../_helpers'

export const runtime = 'nodejs'

interface AckResponse {
  ok: boolean
  alreadyDone?: boolean
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getSession())?.impersonatedStaffEmail) return NextResponse.json({ error: 'Not available in staff view.' }, { status: 403 })
  const gate = await requirePendingActor()
  if (gate.ok === 'no-mapping') {
    return NextResponse.json({ error: 'Not linked' }, { status: 403 })
  }
  if (!gate.ok) return gate.res
  const { id } = await params
  try {
    await reminderBff<AckResponse>('acknowledge', {
      reminderId: id,
      contactId: gate.actor.contactId,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[portal/reminders ack]', e)
    return NextResponse.json({ error: 'Acknowledge failed' }, { status: 502 })
  }
}
