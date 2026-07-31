import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { CardCycleDialog } from '@/features/accounts/CardCycleDialog'
import type { Card } from '@/lib/cards'
import { CategoryIcon } from '@/lib/categoryIcons'
import { effectiveMainId, useCategories, type Category } from '@/lib/categories'
import type { Cycle } from '@/lib/finance/billingCycle'
import { useHousehold } from '@/lib/HouseholdContext'
import { matchesPersonFilter, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { useTransactions } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { CardBillsCard } from './CardBillsCard'

interface Props {
  month: string
  person: PersonFilter
  onCategorySelect: (categoryId: string) => void
}

interface MainRow {
  main: Category
  total: number
  subs: { category: Category; total: number }[]
}

export function OverviewScreen({ month, person, onCategorySelect }: Props) {
  const { householdId, members } = useHousehold()
  const range = useMemo(() => monthRange(month), [month])
  const { data: transactions } = useTransactions(householdId, range)
  const { data: categories } = useCategories(householdId)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [expandedMainId, setExpandedMainId] = useState<string | null>(null)
  const [viewingCycle, setViewingCycle] = useState<{ card: Card; cycle: Cycle } | null>(null)

  // Unconfirmed (generated, unreviewed) rows are excluded from every total (§6.6).
  const confirmed = useMemo(() => (transactions ?? []).filter((t) => t.confirmed), [transactions])
  const filtered = confirmed.filter((t) => matchesPersonFilter(t.owner_id, person))
  const income = filtered.filter((t) => t.kind === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expense = filtered.filter((t) => t.kind === 'expense').reduce((sum, t) => sum + t.amount, 0)

  // Expense by category, rolled up to effective mains (D10): a transaction
  // filed under a sub counts towards its parent, with the sub breakdown
  // available on expand.
  const categoryRows = useMemo<MainRow[]>(() => {
    const byId = new Map((categories ?? []).map((c) => [c.id, c]))
    const mainTotals = new Map<string, number>()
    const subTotals = new Map<string, Map<string, number>>()

    for (const t of filtered) {
      if (t.kind !== 'expense' || !t.category_id) continue
      const category = byId.get(t.category_id)
      if (!category) continue
      const mainId = effectiveMainId(category)
      mainTotals.set(mainId, (mainTotals.get(mainId) ?? 0) + t.amount)
      if (category.parent_id) {
        const subs = subTotals.get(mainId) ?? new Map<string, number>()
        subs.set(category.id, (subs.get(category.id) ?? 0) + t.amount)
        subTotals.set(mainId, subs)
      }
    }

    return [...mainTotals.entries()]
      .map(([id, total]) => {
        const main = byId.get(id)
        if (!main) return null
        const subs = [...(subTotals.get(id) ?? new Map<string, number>()).entries()]
          .map(([subId, subTotal]) => ({ category: byId.get(subId), total: subTotal }))
          .filter((row): row is { category: Category; total: number } => row.category != null)
          .sort((a, b) => b.total - a.total)
        return { main, total, subs }
      })
      .filter((row): row is MainRow => row != null)
      .sort((a, b) => b.total - a.total)
  }, [filtered, categories])
  const maxCategoryTotal = categoryRows[0]?.total ?? 0
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.total, 0)

  // Per-person split uses the unfiltered month, so it only makes sense
  // (and only shows) when the person filter is "All".
  const personRows = useMemo(() => {
    if (person !== 'all') return []
    const rows = [
      ...members.map((m) => ({ key: m.id, label: m.display_name, color: m.color, ownerId: m.id as string | null })),
      { key: 'shared', label: 'Shared', color: '#a78bfa', ownerId: null as string | null },
    ]
    return rows
      .map((row) => {
        const own = confirmed.filter((t) => t.owner_id === row.ownerId)
        return {
          ...row,
          income: own.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0),
          expense: own.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      })
      .filter((row) => row.income > 0 || row.expense > 0)
  }, [confirmed, members, person])

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

      <CardBillsCard month={month} onSelectCycle={(card, cycle) => setViewingCycle({ card, cycle })} />

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
          {/* Collapsed by default (§7.3 v3.1): the planning numbers above are
              the reason to open Overview; the category breakdown is a
              drill-down, not the headline. */}
          <button
            type="button"
            onClick={() => setCategoriesOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-left text-sm transition-colors active:bg-accent/60"
          >
            <span className="flex-1 font-heading font-medium text-muted-foreground">Spending by category</span>
            <span>{formatBaht(categoryTotal)}</span>
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', categoriesOpen && 'rotate-180')} />
          </button>

          {categoriesOpen && (
            <ul className="space-y-1.5">
              {categoryRows.map(({ main, total, subs }) => {
                const isExpanded = expandedMainId === main.id
                return (
                  <li key={main.id} className="space-y-1">
                    <div className="space-y-1.5 rounded-xl border bg-card px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <button
                          onClick={() => onCategorySelect(main.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <CategoryIcon icon={main.icon} className="size-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{main.name}</span>
                          <span>{formatBaht(total)}</span>
                        </button>
                        {subs.length > 0 && (
                          <button
                            onClick={() => setExpandedMainId(isExpanded ? null : main.id)}
                            className="shrink-0 text-muted-foreground"
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${main.name}`}
                          >
                            <ChevronRight className={cn('size-4 transition-transform', isExpanded && 'rotate-90')} />
                          </button>
                        )}
                      </div>
                      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(4, (total / maxCategoryTotal) * 100)}%` }}
                        />
                      </span>
                    </div>

                    {isExpanded && subs.length > 0 && (
                      <ul className="ml-4 space-y-1 border-l pl-3">
                        {subs.map(({ category, total: subTotal }) => (
                          <li key={category.id}>
                            <button
                              onClick={() => onCategorySelect(category.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors active:bg-accent/60"
                            >
                              <CategoryIcon icon={category.icon} className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate">{category.name}</span>
                              <span className="text-muted-foreground">{formatBaht(subTotal)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month yet.</p>}

      {viewingCycle && (
        <CardCycleDialog
          card={viewingCycle.card}
          initialDate={viewingCycle.cycle.end}
          onClose={() => setViewingCycle(null)}
        />
      )}
    </div>
  )
}
