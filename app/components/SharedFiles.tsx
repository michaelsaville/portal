'use client'

import { useEffect, useState } from 'react'

export interface SharedFile {
  id: string
  originalName: string
  mimeType: string | null
  detectedMime: string | null
  size: number | null
  previewable: boolean
  documentId: string | null
  createdAt: string
}

function fmtSize(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function mimeOf(f: SharedFile): string {
  return (f.detectedMime || f.mimeType || '').toLowerCase()
}

// Mirrors DocHub's inline-safety allow-list (images / pdf / text). For anything
// else the BFF forces an attachment, so we offer Download instead of Preview.
function canPreview(f: SharedFile): boolean {
  const m = mimeOf(f)
  return m.startsWith('image/') || m === 'application/pdf' || m.startsWith('text/')
}

function iconFor(f: SharedFile): string {
  const m = mimeOf(f)
  if (m.startsWith('image/')) return '🖼️'
  if (m === 'application/pdf') return '📄'
  if (m.startsWith('text/')) return '📃'
  if (m.includes('spreadsheet') || m.includes('excel') || /\.(xlsx?|csv)$/i.test(f.originalName)) return '📊'
  if (m.includes('word') || /\.docx?$/i.test(f.originalName)) return '📝'
  return '📎'
}

export default function SharedFiles({ files }: { files: SharedFile[] }) {
  const [active, setActive] = useState<SharedFile | null>(null)

  if (!files || files.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
        Shared files ({files.length})
      </h2>
      <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
            <span aria-hidden className="text-lg">{iconFor(f)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-stone-800">{f.originalName}</div>
              {f.size ? <div className="text-xs text-stone-500">{fmtSize(f.size)}</div> : null}
            </div>
            {canPreview(f) ? (
              <button
                type="button"
                onClick={() => setActive(f)}
                className="shrink-0 rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              >
                Preview
              </button>
            ) : (
              <a
                href={`/api/dochub-files/${f.id}?download=1`}
                className="shrink-0 rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
              >
                Download
              </a>
            )}
          </div>
        ))}
      </div>

      {active && <PreviewModal file={active} onClose={() => setActive(null)} />}
    </section>
  )
}

function PreviewModal({ file, onClose }: { file: SharedFile; onClose: () => void }) {
  const src = `/api/dochub-files/${file.id}`
  const m = mimeOf(file)
  const isImage = m.startsWith('image/')
  const isPdf = m === 'application/pdf'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${file.originalName}`}
      onClick={onClose}
    >
      <div
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-lg bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-2.5">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
            {file.originalName}
          </div>
          <a
            href={`/api/dochub-files/${file.id}?download=1`}
            className="shrink-0 rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-stone-100">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={file.originalName} className="mx-auto max-h-full max-w-full object-contain" />
          ) : (
            // PDF + text both render in an iframe (the BFF serves them inline).
            <iframe
              src={src}
              title={file.originalName}
              className="h-full w-full bg-white"
              style={{ minHeight: '70vh' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
