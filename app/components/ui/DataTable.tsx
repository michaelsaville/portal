import type { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: ReactNode
  /** Render fn for the cell. */
  cell: (row: T, index: number) => ReactNode
  /** Right-align numeric / total columns. */
  numeric?: boolean
  /** Hide the column at the given Tailwind breakpoint and below.
   *  e.g. 'sm:hidden' / 'md:hidden'. */
  hideBelow?: 'sm' | 'md' | 'lg'
  /** Width hint via Tailwind class (e.g. 'w-16'). */
  width?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  /** Optional `<tr>` className per row (e.g. for selection highlight). */
  rowClassName?: (row: T, index: number) => string | undefined
}

/**
 * Thin table primitive — handles the chrome (rounded border, sticky
 * header, divider, hover) so callers focus on the data shape. Light
 * by design; richer features (selection, sort, expandable rows) get
 * added when the next page that needs them lands.
 */
export function DataTable<T>({ columns, rows, rowKey, rowClassName }: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
          <tr>
            {columns.map((c) => {
              const hide =
                c.hideBelow === 'sm'
                  ? 'hidden sm:table-cell'
                  : c.hideBelow === 'md'
                    ? 'hidden md:table-cell'
                    : c.hideBelow === 'lg'
                      ? 'hidden lg:table-cell'
                      : ''
              return (
                <th
                  key={c.key}
                  className={`px-4 py-2 ${c.width ?? ''} ${c.numeric ? 'text-right' : ''} ${hide}`.trim()}
                >
                  {c.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className={`hover:bg-stone-50 ${rowClassName?.(row, i) ?? ''}`.trim()}
            >
              {columns.map((c) => {
                const hide =
                  c.hideBelow === 'sm'
                    ? 'hidden sm:table-cell'
                    : c.hideBelow === 'md'
                      ? 'hidden md:table-cell'
                      : c.hideBelow === 'lg'
                        ? 'hidden lg:table-cell'
                        : ''
                return (
                  <td
                    key={c.key}
                    className={`px-4 py-2 ${c.numeric ? 'text-right' : ''} ${hide}`.trim()}
                  >
                    {c.cell(row, i)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
