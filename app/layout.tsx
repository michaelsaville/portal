import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from '@/app/lib/portal-auth'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: 'PCC2K Client Portal',
    template: '%s · PCC2K Portal',
  },
  description:
    'Unified client portal for PCC2K — docs, assets, tickets, estimates, and invoices in one place.',
  robots: { index: false, follow: false },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession()
  const impersonatedBy = session?.impersonatedStaffEmail ?? null

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {impersonatedBy && (
          <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 shadow-md">
            <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-4 flex-wrap text-sm">
              <div className="flex items-center gap-2 font-medium">
                <span className="text-[10px] uppercase tracking-wider bg-amber-900 text-amber-50 px-2 py-0.5 rounded-full">Viewing as client</span>
                <span>Staff tunnel: <code className="font-mono text-xs">{impersonatedBy}</code></span>
                <span className="text-amber-900 text-xs">(read-only)</span>
              </div>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="rounded-md bg-amber-900 text-amber-50 px-3 py-1 text-xs font-medium hover:bg-amber-950">
                  Exit impersonation
                </button>
              </form>
            </div>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
