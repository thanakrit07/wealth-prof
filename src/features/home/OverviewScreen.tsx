import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardCycleDialog } from '@/features/accounts/CardCycleDialog'
import type { Card } from '@/lib/cards'
import { CategoryIcon } from '@/lib/categoryIcons'
import { effectiveMainId, useCategories, type Category } from '@/lib/categories'
import type { Cycle } from '@/lib/finance/billingCycle'
import { useHousehold } from '@/lib/HouseholdContext'
import { matchesPersonFilter, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { useSettlements, useTransactionShares, useUndoRepayment, useUnsettledShares } from '@/lib/transactionShares'
import { useTransactions } from '@/lib/transactions'
import { dayMonthLabel } from '@/lib/month'
import { cn } from '@/lib/utils'
import { CardBillsCard } from './CardBillsCard'
import { SettleUpSheet } from './SettleUpSheet'

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
  const { data: shares } = useTransactionShares(householdId)
  const { data: unsettled } = useUnsettledShares(householdId)
  const { data: settlements } = useSettlements(householdId)
  const undoRepayment = useUndoRepayment(householdId)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [expandedMainId, setExpandedMainId] = useState<string | null>(null)
  const [viewingCycle, setViewingCycle] = useState<{ card: Card; cycle: Cycle } | null>(null)
  const [settling, setSettling] = useState<{ memberA: string; memberB: string } | null>(null)

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

  // A shared transaction (owner_id null) is split evenly by the DB trigger
  // (0022) into one transaction_shares row per member, so each participant's
  // portion counts under their own name here rather than a lump bucket.
  //
  // This must only pull in *split* shares, not *borrow* shares: a borrow
  // (someone's personal expense on someone else's card) is already counted
  // in full through `own` below via t.owner_id === m.id -- adding its share
  // row again here would double it.
  const sharedTxnIds = useMemo(() => new Set(confirmed.filter((t) => t.owner_id === null).map((t) => t.id)), [confirmed])
  const txnById = useMemo(() => new Map(confirmed.map((t) => [t.id, t])), [confirmed])

  // Per-person split uses the unfiltered month, so it only makes sense
  // (and only shows) when the person filter is "All".
  const personRows = useMemo(() => {
    if (person !== 'all') return []
    const sharesThisMonth = (shares ?? []).filter((s) => sharedTxnIds.has(s.transaction_id))

    const memberRows = members.map((m) => {
      const own = confirmed.filter((t) => t.owner_id === m.id)
      const mine = sharesThisMonth.filter((s) => s.member_id === m.id)
      const sharedIncome = mine
        .filter((s) => txnById.get(s.transaction_id)?.kind === 'income')
        .reduce((sum, s) => sum + s.share_amount, 0)
      const sharedExpense = mine
        .filter((s) => txnById.get(s.transaction_id)?.kind === 'expense')
        .reduce((sum, s) => sum + s.share_amount, 0)
      return {
        key: m.id,
        label: m.display_name,
        color: m.color,
        income: own.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0) + sharedIncome,
        expense: own.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0) + sharedExpense,
        sharedExpense,
      }
    })

    return memberRows.filter((row) => row.income > 0 || row.expense > 0)
  }, [confirmed, members, person, shares, sharedTxnIds, txnById])

  // One line per pair of members, from all-time unsettled shares (not scoped
  // to the selected month — an unpaid share from last month is still owed).
  // Built from the very rows the settle-up sheet lists, so the headline is
  // always the sum of what you see when you open it; deriving the two from
  // separate sources is what let them disagree.
  const settlementRows = useMemo(() => {
    const pairs = new Map<
      string,
      { memberA: string; memberB: string; owedByA: number; owedByB: number; count: number }
    >()
    for (const share of unsettled ?? []) {
      // Sorted so both directions of a pair land in the same bucket.
      const [memberA, memberB] = [share.owes_member_id, share.owed_member_id].sort()
      const key = `${memberA}|${memberB}`
      const entry = pairs.get(key) ?? { memberA, memberB, owedByA: 0, owedByB: 0, count: 0 }
      if (share.owes_member_id === memberA) entry.owedByA += share.amount
      else entry.owedByB += share.amount
      entry.count += 1
      pairs.set(key, entry)
    }

    return [...pairs.values()].map((entry) => {
      const net = entry.owedByA - entry.owedByB
      return {
        ...entry,
        owesId: net >= 0 ? entry.memberA : entry.memberB,
        owedId: net >= 0 ? entry.memberB : entry.memberA,
        amount: Math.abs(net),
      }
    })
  }, [unsettled])
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.display_name ?? 'Someone'

  // A summary, not an archive: enough to answer "did we square up recently?"
  // without turning Overview into a ledger of its own.
  const recentSettlements = (settlements ?? []).slice(0, 5)

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

      {settlementRows.length > 0 && (
        <section className="space-y-2">
          {settlementRows.map((row) => (
            <div
              key={`${row.memberA}-${row.memberB}`}
              className="flex items-center justify-between gap-3 rounded-2xl border bg-amber-50 px-4 py-3 text-sm dark:bg-amber-950/30"
            >
              <span className="min-w-0">
                {row.amount > 0 ? (
                  <span className="block">
                    <span className="font-medium">{nameOf(row.owesId)}</span> owes{' '}
                    <span className="font-medium">{nameOf(row.owedId)}</span>{' '}
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{formatBaht(row.amount)}</span>
                  </span>
                ) : (
                  <span className="block font-medium">
                    {nameOf(row.memberA)} and {nameOf(row.memberB)} are even
                  </span>
                )}
                {/* Where the net came from — without this the headline and
                    the items behind "Settle up" look like different numbers. */}
                <span className="block text-xs text-muted-foreground">
                  {row.count} item{row.count === 1 ? '' : 's'}
                  {row.owedByA > 0 && row.owedByB > 0
                    ? ` · net of ${nameOf(row.memberA)} ${formatBaht(row.owedByA)} / ${nameOf(row.memberB)} ${formatBaht(row.owedByB)}`
                    : ''}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setSettling({ memberA: row.memberA, memberB: row.memberB })}
              >
                Settle up
              </Button>
            </div>
          ))}
        </section>
      )}

      <CardBillsCard month={month} onSelectCycle={(card, cycle) => setViewingCycle({ card, cycle })} />

      {personRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-sm font-medium text-muted-foreground">By person</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {personRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="flex-1 truncate">
                  {row.label}
                  {row.sharedExpense > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      incl. {formatBaht(row.sharedExpense)} shared
                    </span>
                  )}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">+{formatBaht(row.income)}</span>
                <span className="text-muted-foreground">-{formatBaht(row.expense)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentSettlements.length > 0 && (
        <section className="space-y-2">
          {/* The repayment history. Each row is a real transfer transaction
              (§4.3), not a flag (D2), so it shows up in the ledger like any
              other movement of money and undo is a plain soft-delete —
              the shares it covered go back to being owed on their own. */}
          <h2 className="font-heading text-sm font-medium text-muted-foreground">Recent repayments</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {recentSettlements.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {nameOf(s.from_member_id)} → {nameOf(s.to_member_id)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {dayMonthLabel(s.settled_on)} · {s.share_count} item{s.share_count === 1 ? '' : 's'}
                    {/* The transfer amount is the net; say so whenever it
                        cleared more debt than cash actually moved. */}
                    {s.gross_amount !== s.amount ? ` · cleared ${formatBaht(s.gross_amount)}` : ''}
                    {/* Only possible if the transfer was edited after the
                        fact — the two numbers agree by construction otherwise. */}
                    {s.net_cleared !== s.amount ? ` · doesn't match linked debts (${formatBaht(s.net_cleared)})` : ''}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatBaht(s.amount)}</span>
                <button
                  type="button"
                  onClick={() => undoRepayment.mutate(s.id)}
                  disabled={undoRepayment.isPending}
                  className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
                >
                  Undo
                </button>
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
                          <CategoryIcon icon={main.icon} color={main.color} className="size-4 shrink-0 text-muted-foreground" />
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
                              <CategoryIcon icon={category.icon} color={category.color} className="size-3.5 shrink-0 text-muted-foreground" />
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

      {settling && (
        <SettleUpSheet
          open
          onOpenChange={(open) => !open && setSettling(null)}
          memberA={settling.memberA}
          memberB={settling.memberB}
        />
      )}
    </div>
  )
}
