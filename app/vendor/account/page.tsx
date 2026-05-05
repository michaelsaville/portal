import { requireVendorSession } from '@/app/lib/vendor-context'
import { Card } from '@/app/components/ui/Card'

export const dynamic = 'force-dynamic'

export default async function VendorAccountPage() {
  const ctx = await requireVendorSession()
  return (
    <div className="p-6 sm:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-stone-800">Account</h1>
          <p className="mt-1 text-sm text-stone-600">
            Your vendor-portal account at PCC2K.
          </p>
        </header>

        <Card>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Name</dt>
              <dd className="text-sm text-stone-800">{ctx.session.user.name}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Email</dt>
              <dd className="text-sm text-stone-800">{ctx.session.user.email}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Vendor</dt>
              <dd className="text-sm text-stone-800">
                {ctx.activeVendor?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Role</dt>
              <dd className="text-sm text-stone-800">
                {ctx.activeVendor?.role ?? '—'}
              </dd>
            </div>
          </dl>
        </Card>

        <p className="mt-6 text-xs text-stone-500">
          Editing your name + password from this page is on the roadmap.
          Contact PCC2K if you need a change in the meantime.
        </p>
      </div>
    </div>
  )
}
