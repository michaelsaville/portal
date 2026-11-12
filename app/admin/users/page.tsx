import { prisma } from '@/app/lib/prisma'
import { requirePortalAdmin } from '@/app/lib/portal-admin'
import { PORTAL_ROLE_KEYS } from '@/app/lib/portal-roles'
import { UsersAdmin } from './UsersAdmin'

export const dynamic = 'force-dynamic'

interface DochubClient {
  id: string
  name: string
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>
}) {
  await requirePortalAdmin()
  const { client: clientFilter } = await searchParams

  // Load portal users + their client links. Client names are resolved
  // separately because the Client table lives in DocHub's schema.
  const users = await prisma.portalUser.findMany({
    where: clientFilter ? { clientLinks: { some: { clientId: clientFilter } } } : undefined,
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    include: {
      clientLinks: { orderBy: { createdAt: 'asc' } },
      remoteGrants: { select: { clientId: true } },
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
          {clientFilter && (
            <p className="mt-2 text-sm text-stone-700">
              Showing users linked to{' '}
              <span className="font-medium">{clientName.get(clientFilter) ?? 'this client'}</span> ·{' '}
              <a href="/admin/users" className="underline hover:text-stone-900">show all</a>
            </p>
          )}
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
              remoteCount: u.remoteGrants.filter((g) => g.clientId === l.clientId).length,
            })),
          }))}
          clients={clients}
          roles={[...PORTAL_ROLE_KEYS]}
          defaultClientId={clientFilter}
        />
      </div>
    </main>
  )
}
