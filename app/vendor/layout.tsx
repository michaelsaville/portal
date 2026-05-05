import { getSession } from '@/app/lib/portal-auth'
import { VendorShell } from './VendorShell'

/**
 * Vendor-portal layout. Wraps every page under /vendor/*. Authenticated
 * vendor sessions get the chrome (sidebar + nav); unauthenticated /
 * customer-persona traffic gets a pass-through layout so the login +
 * invite pages render full-bleed.
 */
export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  const isVendor = session?.user.persona === 'VENDOR'
  if (!isVendor) {
    // Login / invite / unauthenticated — no chrome.
    return <>{children}</>
  }
  return <VendorShell>{children}</VendorShell>
}
