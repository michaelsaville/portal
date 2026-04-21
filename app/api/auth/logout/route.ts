import { NextResponse } from 'next/server'
import { destroySession, audit, getSession } from '@/app/lib/portal-auth'

export async function POST() {
  const session = await getSession()
  if (session) {
    await audit('LOGOUT', { portalUserId: session.user.id })
  }
  await destroySession()
  return NextResponse.json({ ok: true })
}
