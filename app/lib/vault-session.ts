import 'server-only'
import { prisma } from '@/app/lib/prisma'

export const VAULT_SESSION_MINUTES = 15

/**
 * Look up the active unlock session for `(portalUserId, clientId)`.
 * Returns null if missing OR expired (and lazily deletes the expired
 * row so the next lookup is faster).
 */
export async function getActiveVaultSession(
  portalUserId: string,
  clientId: string,
) {
  const row = await prisma.portalVaultSession.findUnique({
    where: { portalUserId_clientId: { portalUserId, clientId } },
  })
  if (!row) return null
  if (row.expiresAt < new Date()) {
    await prisma.portalVaultSession
      .delete({ where: { id: row.id } })
      .catch(() => {})
    return null
  }
  return row
}

export async function unlockVault(portalUserId: string, clientId: string) {
  const expiresAt = new Date(Date.now() + VAULT_SESSION_MINUTES * 60 * 1000)
  await prisma.portalVaultSession.upsert({
    where: { portalUserId_clientId: { portalUserId, clientId } },
    create: { portalUserId, clientId, expiresAt },
    update: { expiresAt },
  })
  return expiresAt
}

export async function lockVault(portalUserId: string, clientId: string) {
  await prisma.portalVaultSession.deleteMany({
    where: { portalUserId, clientId },
  })
}

/**
 * Lock every active vault session for this user. Used by the company
 * switcher: switching from QCM to QCT must lock the QCM vault so the
 * unlocked window doesn't bleed across companies.
 */
export async function lockAllVaults(portalUserId: string) {
  await prisma.portalVaultSession.deleteMany({ where: { portalUserId } })
}
