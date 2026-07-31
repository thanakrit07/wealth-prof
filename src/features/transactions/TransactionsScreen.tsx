import { useMemo, useState } from 'react'
import { ArrowRightLeft, X } from 'lucide-react'
import { CategoryIcon } from '@/lib/categoryIcons'
import { effectiveMainId, useCategories } from '@/lib/categories'
import { useAccounts } from '@/lib/accounts'
import { useCards } from '@/lib/cards'
import { useHousehold } from '@/lib/HouseholdContext'
import { matchesPersonFilter, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { useTransactions, type Transaction } from '@/lib/transactions'
import { ReviewStrip } from './ReviewStrip'
import { TransactionSheet } from './TransactionSheet'

interface Props {
  month: string
  person: PersonFilter
  categoryId?: string | null
  onClearCategory?: () => void
}

export function TransactionsScreen({ month, person, categoryId, onClearCategory }: Props) {
  const { householdId, members } = useHousehold()
  const range = useMemo(() => monthRange(month), [month])
  const { data: transactions } = useTransactions(householdId, range)
  const { data: categories } = useCategories(householdId)
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const instrumentName = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts ?? []) map.set(`account:${a.id}`, a.name)
    for (const c of cards ?? []) map.set(`card:${c.id}`, c.name)
    return map
  }, [accounts, cards])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // A main category's filter also matches transactions filed under its subs
  // (D10 rollup) — the Overview breakdown groups by effective main, so
  // drilling in from there must not drop the sub rows that made up the total.
  const matchesCategory = (t: Transaction) => {
    if (!categoryId) return true
    if (t.category_id === categoryId) return true
    const category = t.category_id ? categoryById.get(t.category_id) : null
    return category != null && effectiveMainId(category) === categoryId
  }
  const filtered = (transactions ?? []).filter((t) => matchesPersonFilter(t.owner_id, person) && matchesCategory(t))
  const filterCategory = categoryId ? categoryById.get(categoryId) : null
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filtered) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  function instrumentLabel(t: Transaction, side: 'from' | 'to'): string {
    const accountId = side === 'from' ? t.from_account_id : t.to_account_id
    const cardId = side === 'from' ? t.from_card_id : t.to_card_id
    if (accountId) return instrumentName.get(`account:${accountId}`) ?? 'Account'
    if (cardId) return instrumentName.get(`card:${cardId}`) ?? 'Card'
    return ''
  }

  return (
    <div className="p-4">
      <ReviewStrip onEdit={setEditing} />
      {filterCategory && (
        <button
          onClick={onClearCategory}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-foreground"
        >
          <CategoryIcon icon={filterCategory.icon} className="size-3.5" />
          {filterCategory.name}
          <X className="size-3" aria-label="Clear category filter" />
        </button>
      )}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month.</p>}
      <div className="space-y-4">
        {groups.map(([date, items]) => (
          <div key={date}>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">{date}</h3>
            <ul className="space-y-1">
              {items.map((t) => {
                const category = t.category_id ? categoryById.get(t.category_id) : null
                const owner = t.owner_id ? memberById.get(t.owner_id) : null
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setEditing(t)}
                      className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      {t.kind === 'transfer' ? (
                        <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <CategoryIcon icon={category?.icon ?? null} className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate">
                          <span className="truncate">
                            {t.kind === 'transfer'
                              ? `${instrumentLabel(t, 'from')} → ${instrumentLabel(t, 'to')}`
                              : t.description || category?.name || t.kind}
                          </span>
                          {!t.confirmed && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                              Pending
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {instrumentLabel(t, 'from')}
                          {owner && ` · ${owner.display_name}`}
                        </p>
                      </div>
                      <span
                        className={
                          t.kind === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : t.kind === 'transfer'
                              ? 'text-muted-foreground'
                              : 'text-foreground'
                        }
                      >
                        {t.kind === 'income' ? '+' : t.kind === 'expense' ? '-' : ''}
                        {formatBaht(t.amount)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {editing && <TransactionSheet open onOpenChange={(open) => !open && setEditing(null)} transaction={editing} />}
    </div>
  )
}
