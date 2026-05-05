import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant =
  /** Default solid action — stone-800 / white. */
  | 'primary'
  /** Outlined neutral — for cancel, "back", secondary actions. */
  | 'secondary'
  /** Destructive — delete, decline, remove. Red border + text. */
  | 'danger'
  /** Affirmative — emerald. Use for Acknowledge / Approve / Confirm. */
  | 'success'
  /** Payment-only — orange-500. Reserved for Pay buttons per proposal §4. */
  | 'pay'
  /** Quiet inline link affordance. No background, just text + hover underline. */
  | 'ghost'

export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-stone-800 text-white hover:bg-stone-700 focus:ring-stone-400',
  secondary:
    'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 focus:ring-stone-400',
  danger:
    'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 focus:ring-rose-400',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-400',
  pay:
    'bg-orange-500 text-white hover:bg-orange-600 focus:ring-orange-300',
  ghost:
    'text-stone-600 hover:text-stone-900 hover:underline focus:ring-stone-400',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Render as an <a> / next/link instead of <button>. */
  href?: string
  /** Marks <a> as new-tab; ignored for <button>. */
  external?: boolean
  className?: string
  children: ReactNode
  fullWidth?: boolean
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps>

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  extra?: string,
) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50'
  const layout = fullWidth ? 'w-full' : ''
  return [base, VARIANT_CLASSES[variant], SIZE_CLASSES[size], layout, extra]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  variant = 'primary',
  size = 'md',
  href,
  external,
  className,
  children,
  fullWidth = false,
  ...rest
}: ButtonProps) {
  const cls = classes(variant, size, fullWidth, className)
  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          aria-disabled={rest.disabled || undefined}
        >
          {children}
        </a>
      )
    }
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    )
  }
  return (
    <button type={rest.type ?? 'button'} className={cls} {...rest}>
      {children}
    </button>
  )
}
