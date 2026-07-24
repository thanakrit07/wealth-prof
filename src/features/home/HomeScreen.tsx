import { useMemo } from 'react'
import { useHousehold } from '@/lib/HouseholdContext'
import { matchesPersonFilter, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { useTransactions } from '@/lib/transactions'

interface Props {
  month: string
  person: PersonFilter
}

export function HomeScreen({ month, person }: Props) {
  const { householdId } = useHousehold()
  const range = useMemo(() => monthRange(month), [month])
  const { data: transactions } = useTransactions(householdId, range)

  const filtered = (transactions ?? []).filter((t) => matchesPersonFilter(t.owner_id, person))
  const income = filtered.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expense = filtered.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-2xl border bg-linear-to-br from-secondary/50 via-card to-accent/40 p-4 shadow-sm">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">This month</h2>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-muted-foreground">Income</dt>
            <dd className="text-emerald-600 dark:text-emerald-400">{formatBaht(income)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Expense</dt>
            <dd>{formatBaht(expense)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Net</dt>
            <dd className={income - expense >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
              {formatBaht(income - expense)}
            </dd>
          </div>
        </dl>
      </div>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month yet.</p>}
    </div>
  )
}
