import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { requirePortalAdmin } from '@/app/lib/portal-admin'
import { listTemplates } from '@/app/lib/messaging/templates'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ tab?: string; q?: string; template?: string }>
}

export default async function AdminMessagesPage({ searchParams }: Props) {
  await requirePortalAdmin()
  const params = await searchParams
  const tab = params.tab === 'log' ? 'log' : 'templates'
  const q = (params.q ?? '').trim()
  const templateFilter = (params.template ?? '').trim()

  const templates = listTemplates()

  const logWhere: Record<string, unknown> = {}
  if (templateFilter) logWhere.templateKey = templateFilter
  if (q) {
    logWhere.OR = [
      { toEmail: { contains: q, mode: 'insensitive' } },
      { toName: { contains: q, mode: 'insensitive' } },
      { subject: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [log, totalSent, totalFailed] = await Promise.all([
    prisma.portalOutboundMessage.findMany({
      where: logWhere,
      orderBy: { sentAt: 'desc' },
      take: 100,
    }),
    prisma.portalOutboundMessage.count({ where: { status: 'SENT' } }),
    prisma.portalOutboundMessage.count({ where: { status: 'FAILED' } }),
  ])

  return (
    <main className="min-h-screen bg-stone-50 text-stone-800 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold">Messages</h1>
            <p className="mt-1 text-sm text-stone-600">
              {templates.length} template{templates.length === 1 ? '' : 's'}{' '}
              registered · {totalSent} sent · {totalFailed} failed
            </p>
          </div>
          <Link
            href="/admin/users"
            className="text-sm text-stone-600 hover:text-stone-800"
          >
            ← back to users
          </Link>
        </header>

        <div className="mb-6 flex gap-2">
          <Link
            href="/admin/messages?tab=templates"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === 'templates' ? 'bg-stone-800 text-white' : 'bg-white border border-stone-300 hover:bg-stone-100'}`}
          >
            Templates ({templates.length})
          </Link>
          <Link
            href="/admin/messages?tab=log"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === 'log' ? 'bg-stone-800 text-white' : 'bg-white border border-stone-300 hover:bg-stone-100'}`}
          >
            Sent log
          </Link>
        </div>

        {tab === 'templates' ? (
          <section className="space-y-4">
            {Object.entries(
              Object.groupBy(templates, (t) => t.category) as Record<
                string,
                typeof templates
              >,
            ).map(([category, items]) => (
              <div key={category}>
                <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                  {category}
                </h2>
                <div className="space-y-3">
                  {(items ?? []).map((t) => {
                    const subject = t.subject(t.sampleVars)
                    const body = t.body(t.sampleVars)
                    return (
                      <div
                        key={t.key}
                        className="rounded-lg border border-stone-200 bg-white p-4 space-y-3"
                      >
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <div>
                            <h3 className="font-medium text-stone-800">
                              {t.name}
                            </h3>
                            <p className="text-xs text-stone-600 mt-0.5">
                              {t.description}
                            </p>
                          </div>
                          <code className="text-[11px] text-stone-500 font-mono">
                            {t.key}
                          </code>
                        </div>

                        <div className="text-xs text-stone-500">
                          <span className="uppercase tracking-wider">
                            Subject:
                          </span>{' '}
                          <span className="text-stone-800">{subject}</span>
                        </div>

                        <details className="text-sm">
                          <summary className="cursor-pointer text-stone-600 hover:text-stone-800">
                            Preview with sample data ↓
                          </summary>
                          <div className="mt-2 rounded border border-stone-200 bg-stone-50 p-3 overflow-auto max-h-[500px]">
                            <iframe
                              srcDoc={body}
                              title={`${t.key} preview`}
                              className="w-full h-[420px] bg-white border border-stone-200 rounded"
                            />
                          </div>
                          <div className="mt-2 rounded border border-stone-200 bg-stone-50 p-3">
                            <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">
                              Sample vars
                            </div>
                            <pre className="text-xs text-stone-700 overflow-auto">
                              {JSON.stringify(t.sampleVars, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section>
            <form
              action="/admin/messages"
              method="get"
              className="mb-3 flex gap-2 flex-wrap items-end"
            >
              <input type="hidden" name="tab" value="log" />
              <label className="text-sm">
                <span className="block text-xs font-medium text-stone-600 mb-1">
                  Search
                </span>
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="email / name / subject"
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-stone-600 mb-1">
                  Template
                </span>
                <select
                  name="template"
                  defaultValue={templateFilter}
                  className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="">any</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.key}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md bg-stone-800 text-white text-sm px-3 py-1.5 hover:bg-stone-700"
              >
                Filter
              </button>
              {(q || templateFilter) && (
                <Link
                  href="/admin/messages?tab=log"
                  className="text-xs text-stone-500 hover:text-stone-700"
                >
                  clear
                </Link>
              )}
            </form>

            {log.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
                No messages match.
              </div>
            ) : (
              <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-4 py-2">When</th>
                      <th className="px-4 py-2">To</th>
                      <th className="px-4 py-2">Template</th>
                      <th className="px-4 py-2">Subject</th>
                      <th className="px-4 py-2 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {log.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-2 text-xs text-stone-500 whitespace-nowrap">
                          {m.sentAt.toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-stone-800">{m.toEmail}</div>
                          {m.toName && (
                            <div className="text-xs text-stone-500">
                              {m.toName}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <code className="text-[11px] text-stone-600 font-mono">
                            {m.templateKey}
                          </code>
                        </td>
                        <td className="px-4 py-2 text-stone-700">
                          {m.subject}
                          {m.errorMessage && (
                            <div className="text-[11px] text-red-700 mt-0.5">
                              {m.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${m.status === 'SENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 text-[11px] text-stone-500 border-t border-stone-200">
                  Most recent 100 shown.
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
