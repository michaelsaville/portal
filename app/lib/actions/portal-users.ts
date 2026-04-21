'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requirePortalAdmin } from '@/app/lib/portal-admin'
import { issueMagicLink, audit } from '@/app/lib/portal-auth'
import { isPortalRole, PORTAL_ROLE_KEYS } from '@/app/lib/portal-roles'
import { sendMessage } from '@/app/lib/messaging/send'

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

/**
 * Invite: create (or re-link) a PortalUser + a link to a client.
 * Issues a PASSWORD_RESET magic link so the invitee sets their own
 * password — login also works via the magic-link flow without ever
 * setting a password if they prefer.
 */
export async function inviteUser(input: {
  email: string
  name: string
  clientId: string
  role: string
}): Promise<ActionResult<{ inviteLink: string }>> {
  const admin = await requirePortalAdmin()
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!email || !name) {
    return { ok: false, error: 'Email and name are required.' }
  }
  if (!isPortalRole(input.role)) {
    return { ok: false, error: 'Unknown role.' }
  }
  if (!input.clientId.trim()) {
    return { ok: false, error: 'Client is required.' }
  }

  const user = await prisma.portalUser.upsert({
    where: { email },
    create: { email, name },
    update: { name },
  })

  // Skip when the link already exists; upsert would overwrite the role
  // silently which is the wrong default for an invite.
  const existingLink = await prisma.portalUserClientLink.findUnique({
    where: {
      portalUserId_clientId: { portalUserId: user.id, clientId: input.clientId },
    },
  })
  if (!existingLink) {
    await prisma.portalUserClientLink.create({
      data: {
        portalUserId: user.id,
        clientId: input.clientId,
        role: input.role,
      },
    })
  }

  const INVITE_TTL_HOURS = 48
  const { token, expiresAt } = await issueMagicLink({
    portalUserId: user.id,
    purpose: 'PASSWORD_RESET',
    ttlMinutes: 60 * INVITE_TTL_HOURS,
  })
  const base = process.env.PUBLIC_URL ?? 'https://portal.pcc2k.com'
  const inviteLink = `${base.replace(/\/$/, '')}/login/reset/${token}`

  await audit('ADMIN_INVITE', {
    portalUserId: admin.user.id,
    clientId: input.clientId,
    data: { targetEmail: email, role: input.role, expiresAt },
  })

  // Resolve the client name for the email template. Lives in DocHub's
  // schema, so raw SQL.
  const [clientRow] = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM public."Client" WHERE id = ${input.clientId} LIMIT 1
  `
  await sendMessage(
    'portal_invite',
    {
      link: inviteLink,
      expiresInHours: INVITE_TTL_HOURS,
      userName: user.name,
      invitedByName: admin.user.name,
      clientName: clientRow?.name ?? 'your organization',
      role: input.role,
    },
    {
      toEmail: user.email,
      toName: user.name,
      portalUserId: user.id,
      metadata: { clientId: input.clientId, role: input.role },
    },
  )

  revalidatePath('/admin/users')
  return { ok: true, data: { inviteLink } }
}

export async function updateLinkRole(input: {
  linkId: string
  role: string
}): Promise<ActionResult> {
  const admin = await requirePortalAdmin()
  if (!isPortalRole(input.role)) {
    return { ok: false, error: 'Unknown role.' }
  }
  const link = await prisma.portalUserClientLink.findUnique({
    where: { id: input.linkId },
  })
  if (!link) return { ok: false, error: 'Link not found.' }
  if (link.role === input.role) return { ok: true }

  await prisma.portalUserClientLink.update({
    where: { id: link.id },
    data: { role: input.role },
  })
  await audit('ADMIN_ROLE_CHANGED', {
    portalUserId: admin.user.id,
    clientId: link.clientId,
    data: {
      targetUserId: link.portalUserId,
      from: link.role,
      to: input.role,
    },
  })
  revalidatePath('/admin/users')
  return { ok: true }
}

export async function setUserActive(input: {
  portalUserId: string
  isActive: boolean
}): Promise<ActionResult> {
  const admin = await requirePortalAdmin()
  if (input.portalUserId === admin.user.id && !input.isActive) {
    return { ok: false, error: "Can't deactivate yourself." }
  }
  const user = await prisma.portalUser.findUnique({
    where: { id: input.portalUserId },
  })
  if (!user) return { ok: false, error: 'User not found.' }
  if (user.isActive === input.isActive) return { ok: true }

  await prisma.portalUser.update({
    where: { id: user.id },
    data: { isActive: input.isActive },
  })
  // Also kill all active sessions for the user on deactivate, so they
  // don't keep using the portal via a live cookie.
  if (!input.isActive) {
    await prisma.portalSession.deleteMany({ where: { portalUserId: user.id } })
  }
  await audit(input.isActive ? 'ADMIN_REACTIVATE' : 'ADMIN_DEACTIVATE', {
    portalUserId: admin.user.id,
    data: { targetUserId: user.id, targetEmail: user.email },
  })
  revalidatePath('/admin/users')
  return { ok: true }
}

export async function removeLink(input: {
  linkId: string
}): Promise<ActionResult> {
  const admin = await requirePortalAdmin()
  const link = await prisma.portalUserClientLink.findUnique({
    where: { id: input.linkId },
  })
  if (!link) return { ok: false, error: 'Link not found.' }

  await prisma.portalUserClientLink.delete({ where: { id: link.id } })
  await audit('ADMIN_LINK_REMOVED', {
    portalUserId: admin.user.id,
    clientId: link.clientId,
    data: { targetUserId: link.portalUserId, role: link.role },
  })
  revalidatePath('/admin/users')
  return { ok: true }
}

export async function listRoleKeys(): Promise<string[]> {
  await requirePortalAdmin()
  return [...PORTAL_ROLE_KEYS]
}
