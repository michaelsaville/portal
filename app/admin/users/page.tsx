import { prisma } from '@/app/lib/prisma'
import { requirePortalAdmin } from '@/app/lib/portal-admin'
import { PORTAL_ROLE_KEYS } from '@/app/lib/portal-roles'
import { UsersAdmin } from './UsersAdmin'

export const dynamic = 'force-dynamic'

interface DochubClient {
  id: string
  name: string
}

export default async function AdminUsersPage() {
  await requirePortalAdmin()

  // Load portal users + their client links. Client names are resolved
  // separately because the Client table lives in DocHub's schema.
  const users = await prisma.portalUser.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    include: {
      clientLinks: { orderBy: { createdAt: 'asc' } },
    },
  })

  const clients = await prisma.$queryRaw<DochubClient[]>`
    SELECT id, name FROM public."Client" WHERE "isActive" = true ORDER BY name
  `
  const clientName = new Map(clients.map((c) => [c.id, c.name]))

  return (
    <main className="min-h-screen bg-stone-50 text-stone-800 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="font-serif text-3xl font-bold">Portal users</h1>
          <p className="mt-1 text-sm text-stone-600">
            {users.length} user{users.length === 1 ? '' : 's'} ·{' '}
            {clients.length} active client{clients.length === 1 ? '' : 's'} in
            DocHub.
          </p>
        </header>

        <UsersAdmin
          users={users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            isActive: u.isActive,
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
            createdAt: u.createdAt.toISOString(),
            links: u.clientLinks.map((l) => ({
              id: l.id,
              clientId: l.clientId,
              clientName: clientName.get(l.clientId) ?? '(unknown client)',
              role: l.role,
            })),
          }))}
          clients={clients}
          roles={[...PORTAL_ROLE_KEYS]}
        />
      </div>
    </main>
  )
}
