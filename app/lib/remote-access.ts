import 'server-only'
import { prisma } from '@/app/lib/prisma'

/** DocHub Client.breezeOrgId — the Breeze org a portal client maps to. */
export async function breezeOrgIdForClient(clientId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ breezeOrgId: string | null }[]>`
    SELECT "breezeOrgId" FROM public."Client" WHERE id = ${clientId} LIMIT 1
  `
  return rows[0]?.breezeOrgId ?? null
}

export async function grantsFor(portalUserId: string, clientId: string) {
  return prisma.portalRemoteGrant.findMany({
    where: { portalUserId, clientId },
    orderBy: { deviceLabel: 'asc' },
  })
}

export async function grantCount(portalUserId: string, clientId: string | null): Promise<number> {
  if (!clientId) return 0
  return prisma.portalRemoteGrant.count({ where: { portalUserId, clientId } })
}
