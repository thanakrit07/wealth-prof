import { useMemo } from 'react'
import { CategoryIcon } from '@/lib/categoryIcons'
import { useCategories } from '@/lib/categories'
import { useHousehold } from '@/lib/HouseholdContext'
import { matchesPersonFilter, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { useTransactions } from '@/lib/transactions'

interface Props {
  month: string
  person: PersonFilter
  onCategorySelect: (categoryId: string) => void
}

export function HomeScreen({ month, person, onCategorySelect }: Props) {
  const { householdId, members } = useHousehold()
  const range = useMemo(() => monthRange(month), [month])
  const { data: transactions } = useTransactions(householdId, range)
  const { data: categories } = useCategories(householdId)

  const filtered = (transactions ?? []).filter((t) => matchesPersonFilter(t.owner_id, person))
  const income = filtered.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expense = filtered.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0)

  // Expense by category for the selected month/person (SPEC §4.1),
  // sorted by amount so the biggest drain is always on top.
  const categoryRows = useMemo(() => {
    const byId = new Map((categories ?? []).map((c) => [c.id, c]))
    const totals = new Map<string, number>()
    for (const t of filtered) {
      if (t.kind !== 'expense' || !t.category_id) continue
      totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount)
    }
    return [...totals.entries()]
      .map(([id, total]) => ({ category: byId.get(id), total }))
      .filter((row) => row.category != null)
      .sort((a, b) => b.total - a.total)
  }, [filtered, categories])
  const maxCategoryTotal = categoryRows[0]?.total ?? 0

  // Per-person split uses the unfiltered month, so it only makes sense
  // (and only shows) when the person filter is "All".
  const personRows = useMemo(() => {
    if (person !== 'all') return []
    const all = transactions ?? []
    const rows = [
      ...members.map((m) => ({ key: m.id, label: m.display_name, color: m.color, ownerId: m.id as string | null })),
      { key: 'shared', label: 'Shared', color: '#a78bfa', ownerId: null as string | null },
    ]
    return rows
      .map((row) => {
        const own = all.filter((t) => t.owner_id === row.ownerId)
        return {
          ...row,
          income: own.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
          expense: own.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      })
      .filter((row) => row.income > 0 || row.expense > 0)
  }, [transactions, members, person])

  return (
    <div className="space-y-4 p-4">
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

      {personRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-sm font-medium text-muted-foreground">By person</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {personRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="flex-1 truncate">{row.label}</span>
                <span className="text-emerald-600 dark:text-emerald-400">+{formatBaht(row.income)}</span>
                <span className="text-muted-foreground">-{formatBaht(row.expense)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {categoryRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-sm font-medium text-muted-foreground">Spending by category</h2>
          <ul className="space-y-1.5">
            {categoryRows.map(({ category, total }) => (
              <li key={category!.id}>
                <button
                  onClick={() => onCategorySelect(category!.id)}
                  className="w-full space-y-1.5 rounded-xl border bg-card px-3 py-2 text-left text-sm hover:bg-accent/40"
                >
                  <span className="flex items-center gap-2">
                    <CategoryIcon icon={category!.icon} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{category!.name}</span>
                    <span>{formatBaht(total)}</span>
                  </span>
                  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max(4, (total / maxCategoryTotal) * 100)}%` }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month yet.</p>}
    </div>
  )
}
