import 'server-only'
import { redirect } from 'next/navigation'
import { getSession, type ResolvedSession } from '@/app/lib/portal-auth'

/**
 * Admin check — pulls a comma-separated allowlist from
 * PORTAL_ADMIN_EMAILS and matches the signed-in user's email
 * case-insensitively.
 *
 * This is deliberately simple. Long-term, portal users who are PCC2K
 * staff should have an isStaff flag on PortalUser and / OR a separate
 * StaffUser model entirely. This env-var shortcut exists so the
 * admin UI can ship today without that design work.
 */
export function parseAdminEmails(): Set<string> {
  const raw = process.env.PORTAL_ADMIN_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  )
}

export function isPortalAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return parseAdminEmails().has(email.toLowerCase())
}

export async function getAdminSession(): Promise<ResolvedSession | null> {
  const session = await getSession()
  if (!session) return null
  if (!isPortalAdminEmail(session.user.email)) return null
  return session
}

export async function requirePortalAdmin(): Promise<ResolvedSession> {
  const session = await getAdminSession()
  if (!session) {
    // Send non-admins back to the home page rather than revealing that
    // /admin exists at all.
    redirect('/')
  }
  return session
}
