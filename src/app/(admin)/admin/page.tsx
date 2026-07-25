import type { Metadata } from 'next'
import { getAdminMetrics, LOW_STOCK_THRESHOLD } from '@/features/admin/data'
import { KpiTile } from '@/features/admin/components/kpi-tile'
import { formatMoney } from '@/lib/money/format'

export const metadata: Metadata = { title: 'Dashboard' }

/** Dashboard home: four live KPI tiles off getAdminMetrics. Dynamic by nature (the layout gate reads the session). */
export default async function AdminDashboardPage() {
  const metrics = await getAdminMetrics()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Orders" value={String(metrics.ordersTotal)} hint="All orders, any status" />
        <KpiTile label="Awaiting fulfilment" value={String(metrics.awaitingFulfilment)} hint="Paid, not yet shipped" />
        <KpiTile
          label="Revenue"
          value={formatMoney({ amountMinor: metrics.revenue.ngn, currency: 'NGN' })}
          secondary={formatMoney({ amountMinor: metrics.revenue.usd, currency: 'USD' })}
          hint="Paid orders, per charge currency"
        />
        <KpiTile label="Low stock" value={String(metrics.lowStock)} hint={`At or below ${LOW_STOCK_THRESHOLD} units`} />
      </div>
    </div>
  )
}
