import { useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useHousehold } from '@/lib/HouseholdContext'
import { formatBaht } from '@/lib/format'
import {
  useInstallmentPayments,
  useInstallments,
  useMarkPeriodPaid,
  type Installment,
} from '@/lib/installments'
import { InstallmentSheet } from './InstallmentSheet'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function InstallmentsScreen() {
  const { householdId, self } = useHousehold()
  const { data: installments } = useInstallments(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const markPaid = useMarkPeriodPaid(householdId)
  const [editing, setEditing] = useState<Installment | 'new' | null>(null)

  const paidCountByInstallment = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments ?? []) {
      map.set(p.installment_id, (map.get(p.installment_id) ?? 0) + 1)
    }
    return map
  }, [payments])

  const active = (installments ?? [])
    .filter((i) => i.status === 'active')
    .sort((a, b) => b.annual_interest_rate - a.annual_interest_rate)
  const finished = (installments ?? []).filter((i) => i.status !== 'active')

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">Installment plans</h2>
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <ul className="space-y-2">
        {active.map((inst) => {
          const paid = paidCountByInstallment.get(inst.id) ?? 0
          const remaining = inst.total_periods - paid
          const outstanding =
            remaining > 0
              ? (remaining - 1) * inst.monthly_amount + (inst.final_amount ?? inst.monthly_amount)
              : 0
          const highInterest = inst.annual_interest_rate >= 5
          return (
            <li key={inst.id} className="space-y-2 rounded-2xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setEditing(inst)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {inst.name}
                    {highInterest && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {paid}/{inst.total_periods} periods · {formatBaht(outstanding)} left
                  </span>
                </button>
                {inst.annual_interest_rate > 0 && (
                  <Badge variant={highInterest ? 'destructive' : 'secondary'}>{inst.annual_interest_rate}%/yr</Badge>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.min(100, (paid / inst.total_periods) * 100)}%` }}
                />
              </div>
              {remaining > 0 &&
                (inst.card_id ? (
                  // D11: card-billed periods post themselves (InstallmentMaterialiser)
                  // on their period date — the charge is on the statement whether or
                  // not anyone taps anything, so there's nothing to mark here.
                  <p className="text-center text-xs text-muted-foreground">
                    Posts automatically · through period {paid}/{inst.total_periods}
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={markPaid.isPending}
                    onClick={() =>
                      markPaid.mutate({
                        installment: inst,
                        periodNo: paid + 1,
                        paidDate: today(),
                        ownerId: inst.owner_id ?? self.id,
                      })
                    }
                  >
                    Mark period {paid + 1} paid
                  </Button>
                ))}
            </li>
          )
        })}
        {active.length === 0 && <p className="text-sm text-muted-foreground">No active installment plans.</p>}
      </ul>

      {finished.length > 0 && (
        <details className="rounded-2xl border bg-card p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">Finished ({finished.length})</summary>
          <ul className="mt-2 space-y-1">
            {finished.map((inst) => (
              <li key={inst.id} className="text-sm text-muted-foreground line-through">
                {inst.name}
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <InstallmentSheet
          key={editing === 'new' ? 'new' : editing.id}
          installment={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
