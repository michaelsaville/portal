import { requireVendorSession } from '@/app/lib/vendor-context'
import { getVendorGrants, resolveActiveGrant, fetchShared } from '@/app/lib/dochub-vendor'
import { selectVendorGrantAction } from '@/app/lib/actions/select-vendor-grant'
import { Card } from '@/app/components/ui/Card'
import { SharedCredentials } from './SharedCredentials'

export const dynamic = 'force-dynamic'

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export default async function VendorSharedPage() {
  const { session } = await requireVendorSession()
  const grants = await getVendorGrants(session.user.id)

  if (grants.length === 0) {
    return (
      <Shell>
        <Card dashed padding="lg" className="text-center">
          <p className="text-sm text-stone-600">
            No client has shared access with you yet. When a PCC2K client grants your company access
            to their credentials or documents, it will appear here.
          </p>
        </Card>
      </Shell>
    )
  }

  const active = resolveActiveGrant(grants, session.activeVendorGrantId)!

  let bundle
  let loadError = false
  try {
    bundle = await fetchShared(active)
  } catch {
    loadError = true
  }

  return (
    <Shell>
      {/* Client switcher — a vendor may serve more than one client */}
      {grants.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {grants.map((g) => {
            const isActive = g.clientId === active.clientId
            return (
              <form key={g.clientId} action={selectVendorGrantAction}>
                <input type="hidden" name="clientId" value={g.clientId} />
                <button
                  type="submit"
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    isActive
                      ? 'border-stone-800 bg-stone-800 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {g.clientName}
                </button>
              </form>
            )
          })}
        </div>
      )}

      <div className="mb-6">
        <div className="text-xs font-medium uppercase tracking-wider text-stone-500">Access for</div>
        <div className="text-lg font-semibold text-stone-800">{active.clientName}</div>
        {bundle?.grant?.label && <div className="text-sm text-stone-600">{bundle.grant.label}</div>}
      </div>

      {loadError && (
        <Card tone="warning" padding="md">
          <p className="text-sm text-amber-800">
            Couldn&rsquo;t load shared items right now. Please try again shortly.
          </p>
        </Card>
      )}

      {bundle && !loadError && (
        <div className="flex flex-col gap-8">
          {/* Credentials */}
          <section>
            <h2 className="mb-2 font-serif text-xl font-semibold text-stone-800">Credentials</h2>
            <SharedCredentials clientId={active.clientId} credentials={bundle.credentials} />
          </section>

          {/* Documents */}
          <section>
            <h2 className="mb-2 font-serif text-xl font-semibold text-stone-800">Documents</h2>
            {bundle.documents.length === 0 ? (
              <p className="text-sm text-stone-500">No documents shared with you for this client.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {bundle.documents.map((d) => (
                  <details key={d.id} className="rounded-md border border-stone-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-medium text-stone-800">
                      {d.title}
                      {d.category && <span className="ml-2 text-xs font-normal text-stone-500">{d.category}</span>}
                    </summary>
                    {d.content && (
                      <pre className="mt-3 whitespace-pre-wrap break-words border-t border-stone-100 pt-3 font-sans text-sm text-stone-700">
                        {d.content}
                      </pre>
                    )}
                  </details>
                ))}
              </div>
            )}
          </section>

          {/* Files */}
          <section>
            <h2 className="mb-2 font-serif text-xl font-semibold text-stone-800">Files</h2>
            {bundle.files.length === 0 ? (
              <p className="text-sm text-stone-500">No files shared with you for this client.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bundle.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-stone-800">{f.originalName}</div>
                      <div className="text-xs text-stone-500">{fmtSize(f.size)}</div>
                    </div>
                    <div className="flex shrink-0 gap-3 text-xs">
                      {f.previewable && (
                        <a href={`/api/vendor/shared/file/${f.id}?client=${active.clientId}`} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
                          View
                        </a>
                      )}
                      <a href={`/api/vendor/shared/file/${f.id}?client=${active.clientId}&download=1`} className="text-stone-600 hover:underline">
                        Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 sm:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-stone-800">Shared with you</h1>
          <p className="mt-1 text-sm text-stone-600">
            Credentials and documents a PCC2K client has granted your company access to.
          </p>
        </header>
        {children}
      </div>
    </div>
  )
}
