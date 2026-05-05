import type { HTMLAttributes, ReactNode } from 'react'

const PADDING: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

const TONE: Record<'default' | 'muted' | 'warning' | 'danger' | 'success', string> = {
  default: 'border-stone-200 bg-white',
  muted: 'border-stone-200 bg-stone-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-rose-200 bg-rose-50',
  success: 'border-emerald-200 bg-emerald-50',
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof PADDING
  tone?: keyof typeof TONE
  /** Adds `border-dashed` for empty-state cards. */
  dashed?: boolean
  children: ReactNode
}

export function Card({
  padding = 'md',
  tone = 'default',
  dashed = false,
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    'rounded-lg border',
    dashed ? 'border-dashed' : '',
    PADDING[padding],
    TONE[tone],
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}
