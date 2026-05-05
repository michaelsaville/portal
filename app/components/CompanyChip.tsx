import { clientAbbrev, clientTint } from '@/app/lib/client-tint'

interface Props {
  clientId: string
  name: string
  role?: string | null
  variant?: 'sidebar' | 'inline'
}

/**
 * Active-company indicator. Sidebar variant stacks the abbrev pill +
 * full name + role. Inline variant is a compact one-liner used inside
 * the company switcher popover and impersonation breadcrumbs.
 */
export default function CompanyChip({ clientId, name, role, variant = 'sidebar' }: Props) {
  const tint = clientTint(clientId)
  const abbrev = clientAbbrev(name)

  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 font-mono text-[10px] font-semibold ${tint.bg} ${tint.text}`}
        >
          {abbrev}
        </span>
        <span className="text-sm text-stone-700">{name}</span>
        {role && (
          <span className="text-[10px] uppercase tracking-wider text-stone-400">
            {role}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <span
        className={`inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold ring-1 ${tint.bg} ${tint.text} ${tint.ring}`}
      >
        {abbrev}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-stone-800" title={name}>
          {name}
        </div>
        {role && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
            {role}
          </div>
        )}
      </div>
    </div>
  )
}
