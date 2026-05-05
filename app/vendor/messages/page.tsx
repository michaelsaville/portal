import { requireVendorSession } from '@/app/lib/vendor-context'
import { Card } from '@/app/components/ui/Card'

export const dynamic = 'force-dynamic'

export default async function VendorMessagesPage() {
  await requireVendorSession()
  return (
    <div className="p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-stone-800">Messages</h1>
          <p className="mt-1 text-sm text-stone-600">
            Two-way messages with PCC2K — coming soon.
          </p>
        </header>
        <Card dashed padding="lg" className="text-center">
          <p className="text-sm text-stone-600">
            Messaging is on the vendor-portal roadmap. Keep emailing for now.
          </p>
        </Card>
      </div>
    </div>
  )
}
