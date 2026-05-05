'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Mobile-only drawer toggle. Renders the hamburger button when sidebar
 * is hidden (`md:hidden`); slides the drawer panel in from the left.
 * Server-rendered sidebar is the drawer body — passed as children.
 *
 * Auto-closes on route change so navigating doesn't leave the drawer
 * stuck open over the new page content.
 */
export default function MobileDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onEsc)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
      >
        <span className="block h-0.5 w-5 bg-current" />
        <span className="sr-only">Menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl flex">
            {children}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}
