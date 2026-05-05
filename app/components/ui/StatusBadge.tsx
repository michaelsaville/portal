import type { ReactNode } from 'react'

export type BadgeKind =
  | 'ticket'
  | 'invoice'
  | 'estimate'
  | 'reminder'
  | 'vault-visibility'
  | 'generic'

const TICKET_PALETTE: Record<string, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  OPEN: 'bg-sky-100 text-sky-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  WAITING_CUSTOMER: 'bg-violet-100 text-violet-800',
  WAITING_THIRD_PARTY: 'bg-violet-100 text-violet-800',
  WAITING: 'bg-violet-100 text-violet-800',
  WAITING_ON_CLIENT: 'bg-violet-100 text-violet-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  CLOSED: 'bg-stone-100 text-stone-600',
  CANCELLED: 'bg-stone-100 text-stone-500',
}

const INVOICE_PALETTE: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-600',
  SENT: 'bg-sky-100 text-sky-800',
  VIEWED: 'bg-sky-100 text-sky-800',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  OVERDUE: 'bg-rose-100 text-rose-700',
  WRITTEN_OFF: 'bg-stone-100 text-stone-500',
  VOID: 'bg-stone-100 text-stone-500',
}

const ESTIMATE_PALETTE: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-600',
  SENT: 'bg-sky-100 text-sky-800',
  VIEWED: 'bg-sky-100 text-sky-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-rose-100 text-rose-700',
  EXPIRED: 'bg-stone-100 text-stone-500',
  CANCELLED: 'bg-stone-100 text-stone-500',
}

const REMINDER_PALETTE: Record<string, string> = {
  ACTIVE: 'bg-sky-100 text-sky-800',
  SNOOZED: 'bg-amber-100 text-amber-800',
  ACKNOWLEDGED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-stone-100 text-stone-500',
}

const VAULT_PALETTE: Record<string, string> = {
  PRIVATE: 'bg-stone-200 text-stone-700',
  TEAM: 'bg-sky-100 text-sky-800',
  MSP_SHARED: 'bg-violet-100 text-violet-800',
}

const FALLBACK = 'bg-stone-100 text-stone-700'

function paletteFor(kind: BadgeKind): Record<string, string> {
  switch (kind) {
    case 'ticket':
      return TICKET_PALETTE
    case 'invoice':
      return INVOICE_PALETTE
    case 'estimate':
      return ESTIMATE_PALETTE
    case 'reminder':
      return REMINDER_PALETTE
    case 'vault-visibility':
      return VAULT_PALETTE
    default:
      return {}
  }
}

interface Props {
  status: string
  kind?: BadgeKind
  /** Override the default casing transform. Defaults to lowercase
   *  with underscores → spaces. */
  label?: ReactNode
  className?: string
}

export function StatusBadge({ status, kind = 'generic', label, className }: Props) {
  const palette = paletteFor(kind)
  const tone = palette[status] ?? FALLBACK
  const display =
    label ??
    (kind === 'vault-visibility'
      ? status === 'MSP_SHARED'
        ? 'Shared with PCC2K'
        : status[0] + status.slice(1).toLowerCase()
      : status.replace(/_/g, ' ').toLowerCase())
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${tone} ${className ?? ''}`.trim()}
    >
      {display}
    </span>
  )
}
