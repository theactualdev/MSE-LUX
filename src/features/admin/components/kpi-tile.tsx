import { Card } from '@/components/ui/card'

/** One dashboard metric: label, headline value, optional second line (e.g. the other currency) and hint. */
export function KpiTile({ label, value, secondary, hint }: { label: string; value: string; secondary?: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {secondary ? <p className="text-sm font-medium tabular-nums text-muted-foreground">{secondary}</p> : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}
