import { NextResponse } from 'next/server'
import { requirePendingActor, reminderBff } from './_helpers'

export const runtime = 'nodejs'

interface ListResponse {
  ok: boolean
  reminders: Array<Record<string, unknown>>
}

export async function GET() {
  const gate = await requirePendingActor()
  if (gate.ok === 'no-mapping') {
    // Staff-side hasn't matched this portal user to a TH contact yet
    // — render as empty rather than an error.
    return NextResponse.json({ reminders: [], unmapped: true })
  }
  if (!gate.ok) return gate.res
  try {
    const r = await reminderBff<ListResponse>('list', {
      contactId: gate.actor.contactId,
    })
    return NextResponse.json({ reminders: r.reminders ?? [] })
  } catch (e) {
    console.error('[portal/reminders list]', e)
    return NextResponse.json({ error: 'Pending unavailable' }, { status: 502 })
  }
}
