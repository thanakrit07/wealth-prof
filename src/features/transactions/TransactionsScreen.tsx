import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { SwipeableRow } from '@/components/SwipeableRow'
import { CategoryIcon } from '@/lib/categoryIcons'
import { effectiveMainId, useCategories } from '@/lib/categories'
import { useInstrumentNames } from '@/lib/instruments'
import { useHousehold } from '@/lib/HouseholdContext'
import { matchesPersonFilter, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { dayOfMonthLabel, monthRange, weekdayLabel } from '@/lib/month'
import { supabase } from '@/lib/supabase'
import { parsePeriodSourceKey } from '@/lib/installmentMaterialiser'
import { useInstallmentPayments, useSetPeriodPaid } from '@/lib/installments'
import { useDeleteTransaction, useTransactions, type Transaction } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { ReviewStrip } from './ReviewStrip'
import { TransactionSheet } from './TransactionSheet'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

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
  // Includes deleted accounts/cards, so a past transaction keeps naming
  // where the money actually moved (see useInstrumentNames).
  const { data: instrumentName } = useInstrumentNames(householdId)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const remove = useDeleteTransaction(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const setPeriodPaid = useSetPeriodPaid(householdId)
  const queryClient = useQueryClient()

  // Settled installment periods, keyed "<installmentId>:<periodNo>".
  const paidKeys = useMemo(
    () => new Set((payments ?? []).map((p) => `${p.installment_id}:${p.period_no}`)),
    [payments],
  )

  /**
   * The tick box only exists on installment periods charged to a **card**:
   * that is the one case where posting and settling genuinely differ — the
   * charge is on the statement the moment the period lands, but the money
   * only leaves when the statement gets paid. Cash and bank rows have no
   * such gap, so a checkbox there would be a question with no answer.
   */
  function installmentPeriodOf(t: Transaction) {
    if (t.source !== 'installment' || !t.from_card_id) return null
    return parsePeriodSourceKey(t.source_key)
  }

  // Soft delete with undo, same contract as saving from the sheet: the row
  // only sets deleted_at, so restoring is a matching update.
  async function handleDelete(t: Transaction) {
    await remove.mutateAsync(t.id)
    toast.success('Transaction deleted', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await supabase.from('transactions').update({ deleted_at: null }).eq('id', t.id)
          queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
        },
      },
    })
  }

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
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
    if (accountId) return instrumentName?.[`account:${accountId}`] ?? 'Account'
    if (cardId) return instrumentName?.[`card:${cardId}`] ?? 'Card'
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
          <CategoryIcon icon={filterCategory.icon} color={filterCategory.color} className="size-3.5" />
          {filterCategory.name}
          <X className="size-3" aria-label="Clear category filter" />
        </button>
      )}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month.</p>}
      {/* One continuous ledger rather than a card per row (Money Manager
          density): day headers carry that day's totals, and hairline
          dividers replace the per-row borders and gaps. */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {groups.map(([date, items], groupIndex) => {
          const dayIncome = items.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
          const dayExpense = items.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
          return (
            <div key={date} className={groupIndex > 0 ? 'border-t' : undefined}>
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1">
                <span className="text-sm font-semibold tabular-nums">{dayOfMonthLabel(date)}</span>
                <span className="rounded bg-background px-1.5 py-px text-[10px] text-muted-foreground">
                  {weekdayLabel(date)}
                </span>
                <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
                  {dayIncome > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">{formatBaht(dayIncome)}</span>
                  )}
                  {dayExpense > 0 && <span className="text-muted-foreground">{formatBaht(dayExpense)}</span>}
                </span>
              </div>

              <ul>
                {items.map((t) => {
                  const category = t.category_id ? categoryById.get(t.category_id) : null
                  const owner = t.owner_id ? memberById.get(t.owner_id) : null
                  const title =
                    t.kind === 'transfer'
                      ? `${instrumentLabel(t, 'from')} → ${instrumentLabel(t, 'to')}`
                      : t.note || category?.name || t.kind
                  // Category only repeats below when it isn't already the title.
                  const details = [category?.name === title ? null : category?.name, instrumentLabel(t, 'from'), owner?.display_name]
                    .filter(Boolean)
                    .join(' · ')
                  const period = installmentPeriodOf(t)
                  const periodKey = period ? `${period.installmentId}:${period.periodNo}` : null
                  const periodPaid = periodKey != null && paidKeys.has(periodKey)
                  return (
                    <li key={t.id} className="border-t">
                      <SwipeableRow onDelete={() => handleDelete(t)}>
                        <div className="flex items-center">
                          <button
                            onClick={() => setEditing(t)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 text-left transition-colors active:bg-accent/60"
                          >
                            {t.kind === 'transfer' ? (
                              <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <CategoryIcon icon={category?.icon ?? null} color={category?.color} className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className={cn('truncate text-sm', periodPaid && 'text-muted-foreground')}>{title}</span>
                                {!t.confirmed && (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                    Pending
                                  </span>
                                )}
                              </span>
                              {details && <span className="block truncate text-[11px] text-muted-foreground">{details}</span>}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 text-sm tabular-nums',
                                t.kind === 'income'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : t.kind === 'transfer'
                                    ? 'text-muted-foreground'
                                    : 'text-foreground',
                              )}
                            >
                              {t.kind === 'income' ? '+' : t.kind === 'expense' ? '-' : ''}
                              {formatBaht(t.amount)}
                            </span>
                          </button>

                          {/* Card-billed installment periods only: tick when the
                              statement carrying this period has been paid. */}
                          {period ? (
                            <button
                              onClick={() =>
                                setPeriodPaid.mutate({
                                  installmentId: period.installmentId,
                                  periodNo: period.periodNo,
                                  transactionId: t.id,
                                  paidDate: t.date > todayIso() ? todayIso() : t.date,
                                  paid: !periodPaid,
                                })
                              }
                              disabled={setPeriodPaid.isPending}
                              role="checkbox"
                              aria-checked={periodPaid}
                              aria-label={`Mark period ${period.periodNo} of ${title} paid`}
                              className="shrink-0 px-3 py-1.5"
                            >
                              <span
                                className={cn(
                                  'flex size-5 items-center justify-center rounded-md border transition-colors',
                                  periodPaid
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-muted-foreground/40 text-transparent',
                                )}
                              >
                                <Check className="size-3.5" />
                              </span>
                            </button>
                          ) : (
                            <span className="w-3 shrink-0" />
                          )}
                        </div>
                      </SwipeableRow>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {editing && <TransactionSheet open onOpenChange={(open) => !open && setEditing(null)} transaction={editing} />}
    </div>
  )
}
