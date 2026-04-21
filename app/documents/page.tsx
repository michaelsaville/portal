import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { getSession } from '@/app/lib/portal-auth'
import { signedPost } from '@/app/lib/bff-client'

export const dynamic = 'force-dynamic'

interface Doc {
  id: string
  title: string
  category: string | null
  isPinned: boolean
  updatedAt: string
  folder: { id: string; name: string } | null
  _count: { attachments: number }
}

interface DocsResponse {
  ok: boolean
  documents: Doc[]
  error?: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function DocumentsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/documents')

  let activeClientId = session.activeClientId
  if (!activeClientId) {
    const link = await prisma.portalUserClientLink.findFirst({
      where: { portalUserId: session.user.id },
      select: { clientId: true },
      orderBy: { createdAt: 'asc' },
    })
    activeClientId = link?.clientId ?? null
  }

  if (!activeClientId) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-serif text-3xl font-bold text-stone-800">Documents</h1>
          <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
            Your account isn't linked to a client yet. Ask PCC2K to set that up.
          </p>
          <p className="mt-4"><Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link></p>
        </div>
      </main>
    )
  }

  let documents: Doc[] = []
  let error: string | null = null
  try {
    const data = await signedPost<DocsResponse>(
      process.env.DOCHUB_BFF_URL ?? '',
      '/api/bff/portal/dochub/documents',
      { clientId: activeClientId },
    )
    documents = data.documents ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const byFolder = new Map<string, { name: string; items: Doc[] }>()
  for (const d of documents) {
    const key = d.folder?.id ?? '__root__'
    const name = d.folder?.name ?? 'Ungrouped'
    const entry = byFolder.get(key) ?? { name, items: [] }
    entry.items.push(d)
    byFolder.set(key, entry)
  }

  return (
    <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-800">Documents</h1>
            <p className="mt-1 text-sm text-stone-600">
              {documents.length} document{documents.length === 1 ? '' : 's'} on record
            </p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-800">← back</Link>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Couldn't load documents: {error}
          </div>
        )}

        {!error && documents.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-600">
            Nothing on record yet.
          </div>
        )}

        {documents.length > 0 && (
          <div className="space-y-8">
            {Array.from(byFolder.values()).map((f) => (
              <section key={f.name}>
                <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">{f.name}</h2>
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                      <tr>
                        <th className="px-4 py-2">Title</th>
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2">Attachments</th>
                        <th className="px-4 py-2">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {f.items.map((d) => (
                        <tr key={d.id}>
                          <td className="px-4 py-2 text-stone-800">
                            {d.isPinned && <span className="mr-2 text-amber-600" title="Pinned">★</span>}
                            {d.title}
                          </td>
                          <td className="px-4 py-2 text-stone-700">{d.category ?? '—'}</td>
                          <td className="px-4 py-2 text-stone-700">{d._count.attachments || '—'}</td>
                          <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">{formatDate(d.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-8 text-xs text-stone-500">
          Document contents aren't shown here — ask PCC2K if you need the body of a specific doc.
        </p>
      </div>
    </main>
  )
}
