import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const FIELD_BASE =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400 disabled:cursor-not-allowed disabled:bg-stone-50'

const LABEL_CLASS =
  'block font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1'

const ERROR_CLASS = 'mt-1 text-xs text-rose-700'

const HINT_CLASS = 'mt-1 text-xs text-stone-500'

interface FieldChrome {
  /** Label text rendered above the field. Falsy = no label. */
  label?: ReactNode
  /** Inline help under the field; rose-tinted for errors. */
  hint?: ReactNode
  /** Renders the hint in error tone. Cosmetic only — accessibility
   *  is on the caller. */
  error?: ReactNode
  /** Wrapper class — usually `flex-1` etc. */
  wrapperClassName?: string
}

function Field({
  id,
  label,
  hint,
  error,
  wrapperClassName,
  children,
}: FieldChrome & { id?: string; children: ReactNode }) {
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} className={LABEL_CLASS}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className={ERROR_CLASS}>{error}</p>
      ) : hint ? (
        <p className={HINT_CLASS}>{hint}</p>
      ) : null}
    </div>
  )
}

type TextInputProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, keyof FieldChrome>

export function TextInput({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  ...rest
}: TextInputProps) {
  const inputCls = [FIELD_BASE, className].filter(Boolean).join(' ')
  return (
    <Field id={id} label={label} hint={hint} error={error} wrapperClassName={wrapperClassName}>
      <input id={id} className={inputCls} {...rest} />
    </Field>
  )
}

type SelectProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, keyof FieldChrome> & {
    children: ReactNode
  }

export function Select({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  children,
  ...rest
}: SelectProps) {
  const selectCls = [FIELD_BASE, className].filter(Boolean).join(' ')
  return (
    <Field id={id} label={label} hint={hint} error={error} wrapperClassName={wrapperClassName}>
      <select id={id} className={selectCls} {...rest}>
        {children}
      </select>
    </Field>
  )
}

type TextareaProps = FieldChrome &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof FieldChrome>

export function Textarea({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  rows = 3,
  ...rest
}: TextareaProps) {
  const textareaCls = [FIELD_BASE, className].filter(Boolean).join(' ')
  return (
    <Field id={id} label={label} hint={hint} error={error} wrapperClassName={wrapperClassName}>
      <textarea id={id} className={textareaCls} rows={rows} {...rest} />
    </Field>
  )
}
