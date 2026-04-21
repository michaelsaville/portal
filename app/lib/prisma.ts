import { PrismaClient } from '@prisma/client'

// Next.js hot-reloads in dev and would otherwise create a fresh client
// every HMR tick until Postgres' max_connections tips over. Pinning on
// globalThis keeps one instance per Node process.

declare global {
  // eslint-disable-next-line no-var
  var __portalPrisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__portalPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__portalPrisma = prisma
}
