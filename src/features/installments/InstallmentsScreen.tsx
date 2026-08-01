import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { periodDate } from '@/lib/finance/billingCycle'
import { useHousehold } from '@/lib/HouseholdContext'
import { formatBaht } from '@/lib/format'
import {
  useInstallmentPayments,
  useInstallments,
  useMarkPeriodPaid,
  type Installment,
  type InstallmentPayment,
} from '@/lib/installments'
import { useUnconfirmedTransactions } from '@/lib/transactions'
import { InstallmentSheet } from './InstallmentSheet'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// source_key = "installment:<id>:<periodNo>" (installmentMaterialiser.ts /
// useMarkPeriodPaid) — parsed here to tell which period a pending-review
// row belongs to, since there's no dedicated column for it.
function parseInstallmentSourceKey(sourceKey: string | null): { installmentId: string; periodNo: number } | null {
  if (!sourceKey) return null
  const [tag, installmentId, periodNoStr] = sourceKey.split(':')
  if (tag !== 'installment') return null
  const periodNo = Number(periodNoStr)
  if (!installmentId || !Number.isFinite(periodNo)) return null
  return { installmentId, periodNo }
}

export function InstallmentsScreen() {
  const { householdId, self } = useHousehold()
  const { data: installments } = useInstallments(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const { data: unconfirmed } = useUnconfirmedTransactions(householdId)
  const markPaid = useMarkPeriodPaid(householdId)
  const [editing, setEditing] = useState<Installment | 'new' | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const paidCountByInstallment = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments ?? []) {
      map.set(p.installment_id, (map.get(p.installment_id) ?? 0) + 1)
    }
    return map
  }, [payments])

  const paymentsByInstallment = useMemo(() => {
    const map = new Map<string, InstallmentPayment[]>()
    for (const p of payments ?? []) {
      const list = map.get(p.installment_id) ?? []
      list.push(p)
      map.set(p.installment_id, list)
    }
    return map
  }, [payments])

  // Periods already posted but awaiting review (account-billed only —
  // DESIGN §4.5/§6.7): not yet a "paid" event, so shown separately from
  // installment_payments.
  const pendingPeriodsByInstallment = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const t of unconfirmed ?? []) {
      if (t.source !== 'installment') continue
      const parsed = parseInstallmentSourceKey(t.source_key)
      if (!parsed) continue
      const set = map.get(parsed.installmentId) ?? new Set<number>()
      set.add(parsed.periodNo)
      map.set(parsed.installmentId, set)
    }
    return map
  }, [unconfirmed])

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
          const pendingPeriods = pendingPeriodsByInstallment.get(inst.id)
          const nextPeriodPending = pendingPeriods?.has(paid + 1) ?? false
          const isExpanded = expanded === inst.id
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
                (nextPeriodPending ? (
                  // Already posted (unconfirmed) by the materialiser — confirming
                  // it in the review strip is what marks it paid (§4.5/§6.7).
                  <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                    Period {paid + 1} posted · confirm it in Transactions to review
                  </p>
                ) : inst.card_id ? (
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

              <button
                className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground"
                onClick={() => setExpanded(isExpanded ? null : inst.id)}
              >
                Pay credit · which periods are paid
                <ChevronDown className={`size-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isExpanded && (
                <ul className="grid grid-cols-4 gap-1.5 rounded-xl bg-muted/40 p-2 sm:grid-cols-6">
                  {Array.from({ length: inst.total_periods }, (_, i) => i + 1).map((n) => {
                    const paidEntry = paymentsByInstallment.get(inst.id)?.find((p) => p.period_no === n)
                    const isPending = pendingPeriods?.has(n) ?? false
                    const status = paidEntry ? 'paid' : isPending ? 'pending' : 'upcoming'
                    return (
                      <li
                        key={n}
                        className={
                          'rounded-lg border px-1.5 py-1 text-center text-[11px] ' +
                          (status === 'paid'
                            ? 'border-emerald-400/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-400'
                            : status === 'pending'
                              ? 'border-amber-400/60 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-400'
                              : 'border-transparent text-muted-foreground')
                        }
                        title={paidEntry ? `Paid ${paidEntry.paid_date}` : periodDate(inst.start_date, n)}
                      >
                        <span className="block font-medium">#{n}</span>
                        <span className="block">
                          {status === 'paid' ? 'Paid' : status === 'pending' ? 'Review' : periodDate(inst.start_date, n).slice(5)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
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
