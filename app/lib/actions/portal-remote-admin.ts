'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requirePortalAdmin } from '@/app/lib/portal-admin'
import { audit } from '@/app/lib/portal-auth'
import { breezeOrgIdForClient } from '@/app/lib/remote-access'
import { listOrgDevices, deviceLabel, breezeConfigured } from '@/app/lib/breeze'
import { signImpersonationToken } from '@/app/lib/portal-impersonate'
import type { ActionResult } from '@/app/lib/actions/portal-users'

// Every export here is a public server-action endpoint — each one gates
// on requirePortalAdmin() itself.

export interface RemoteDeviceRow {
  id: string
  label: string
  status: string
  granted: boolean
}

/** Breeze devices in this link's client org, flagged with the user's grants. */
export async function loadRemoteDevices(input: {
  portalUserId: string
  clientId: string
}): Promise<ActionResult<{ devices: RemoteDeviceRow[]; orphanGrants: { id: string; label: string }[] }>> {
  await requirePortalAdmin()
  if (!breezeConfigured()) {
    return { ok: false, error: 'Breeze broker account is not configured (BREEZE_BROKER_* env).' }
  }
  const orgId = await breezeOrgIdForClient(input.clientId)
  if (!orgId) {
    return { ok: false, error: 'This client has no Breeze organization mapped in DocHub (Client.breezeOrgId).' }
  }
  const [devices, grants] = await Promise.all([
    listOrgDevices(orgId),
    prisma.portalRemoteGrant.findMany({
      where: { portalUserId: input.portalUserId, clientId: input.clientId },
    }),
  ])
  const granted = new Set(grants.map((g) => g.breezeDeviceId))
  const ids = new Set(devices.map((d) => d.id))
  return {
    ok: true,
    data: {
      devices: devices
        .map((d) => ({ id: d.id, label: deviceLabel(d), status: d.status, granted: granted.has(d.id) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      // Grants whose device left this org — shown so staff can clean up.
      orphanGrants: grants
        .filter((g) => !ids.has(g.breezeDeviceId))
        .map((g) => ({ id: g.breezeDeviceId, label: g.deviceLabel })),
    },
  }
}

export async function setRemoteGrant(input: {
  portalUserId: string
  clientId: string
  deviceId: string
  granted: boolean
}): Promise<ActionResult> {
  const admin = await requirePortalAdmin()
  const link = await prisma.portalUserClientLink.findUnique({
    where: { portalUserId_clientId: { portalUserId: input.portalUserId, clientId: input.clientId } },
    select: { id: true },
  })
  if (!link) return { ok: false, error: 'User is not linked to that client.' }

  if (!input.granted) {
    await prisma.portalRemoteGrant.deleteMany({
      where: { portalUserId: input.portalUserId, clientId: input.clientId, breezeDeviceId: input.deviceId },
    })
    await audit('ADMIN_REMOTE_REVOKED', {
      portalUserId: admin.user.id,
      clientId: input.clientId,
      data: { targetUserId: input.portalUserId, breezeDeviceId: input.deviceId },
    })
    revalidatePath('/admin/users')
    return { ok: true }
  }

  // Only grant a device that really is in this client's Breeze org.
  const orgId = await breezeOrgIdForClient(input.clientId)
  if (!orgId) return { ok: false, error: 'Client has no Breeze organization mapped.' }
  const device = (await listOrgDevices(orgId)).find((d) => d.id === input.deviceId)
  if (!device) return { ok: false, error: "That device isn't in this client's Breeze organization." }

  await prisma.portalRemoteGrant.upsert({
    where: { portalUserId_breezeDeviceId: { portalUserId: input.portalUserId, breezeDeviceId: device.id } },
    create: {
      portalUserId: input.portalUserId,
      clientId: input.clientId,
      breezeDeviceId: device.id,
      deviceLabel: deviceLabel(device),
      grantedByEmail: admin.user.email,
    },
    update: { clientId: input.clientId, deviceLabel: deviceLabel(device), grantedByEmail: admin.user.email },
  })
  await audit('ADMIN_REMOTE_GRANTED', {
    portalUserId: admin.user.id,
    clientId: input.clientId,
    data: { targetUserId: input.portalUserId, breezeDeviceId: device.id, device: deviceLabel(device) },
  })
  revalidatePath('/admin/users')
  return { ok: true }
}

/**
 * "View as this user": a 2-minute signed hand-off to /impersonate that opens
 * a read-only staff session as this exact user at this client. It replaces
 * the admin's own portal session in this browser.
 */
export async function viewAsUserLink(input: {
  portalUserId: string
  clientId: string
}): Promise<ActionResult<{ url: string }>> {
  const admin = await requirePortalAdmin()
  const link = await prisma.portalUserClientLink.findUnique({
    where: { portalUserId_clientId: { portalUserId: input.portalUserId, clientId: input.clientId } },
    select: { id: true },
  })
  if (!link) return { ok: false, error: 'User is not linked to that client.' }
  const [row] = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM public."Client" WHERE id = ${input.clientId} LIMIT 1
  `
  const token = signImpersonationToken(
    {
      dochubClientId: input.clientId,
      clientName: row?.name ?? 'client',
      staffEmail: admin.user.email,
      staffName: admin.user.name,
      portalUserId: input.portalUserId,
    },
    process.env.PORTAL_BFF_SECRET ?? '',
  )
  return { ok: true, data: { url: `/impersonate?token=${encodeURIComponent(token)}` } }
}
