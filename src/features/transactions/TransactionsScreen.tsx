import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SwipeableRow } from '@/components/SwipeableRow'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { CategoryIcon } from '@/lib/categoryIcons'
import { categoryPath, effectiveMainId, useCategories } from '@/lib/categories'
import type { Card } from '@/lib/cards'
import type { Cycle } from '@/lib/finance/billingCycle'
import { useInstrumentNames } from '@/lib/instruments'
import { useHousehold } from '@/lib/HouseholdContext'
import { borneAmount, matchesPersonFilter, sharesByTransaction, type PersonFilter } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { dayOfMonthLabel, monthRange, weekdayLabel } from '@/lib/month'
import { supabase } from '@/lib/supabase'
import { parsePeriodSourceKey } from '@/lib/installmentMaterialiser'
import { useInstallmentPayments, useSetPeriodPaid } from '@/lib/installments'
import { useTransactionShares } from '@/lib/transactionShares'
import { useDeleteTransaction, useTransactions, type Transaction } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { RecordsSummary } from './RecordsSummary'
import { ReviewStrip } from './ReviewStrip'
import { TransactionSheet } from './TransactionSheet'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  month: string
  person: PersonFilter
  search: string
  categoryId?: string | null
  onClearCategory?: () => void
  accountId?: string | null
  onClearAccount?: () => void
  // A card's natural period is its billing cycle, not the calendar month
  // (§7.3 v3.8) — when set, this overrides `month` for the fetch range and
  // swaps the usual In/Out summary for CardCycleSummary's bill total.
  card?: Card | null
  cardCycle?: Cycle | null
  onClearCard?: () => void
}

export function TransactionsScreen({
  month,
  person,
  search,
  categoryId,
  onClearCategory,
  accountId,
  onClearAccount,
  card,
  cardCycle,
  onClearCard,
}: Props) {
  const { householdId, members } = useHousehold()
  const range = useMemo(
    () => (cardCycle ? { start: cardCycle.start, end: cardCycle.end } : monthRange(month)),
    [month, cardCycle],
  )
  const { data: transactions } = useTransactions(householdId, range)
  const { data: categories } = useCategories(householdId)
  const { data: shares } = useTransactionShares(householdId)
  // Includes deleted accounts/cards, so a past transaction keeps naming
  // where the money actually moved (see useInstrumentNames).
  const { data: instrumentName } = useInstrumentNames(householdId)
  const isDesktop = useIsDesktop()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<Transaction | null>(null)
  const remove = useDeleteTransaction(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const setPeriodPaid = useSetPeriodPaid(householdId)
  const queryClient = useQueryClient()

  const sharesByTxn = useMemo(() => sharesByTransaction(shares), [shares])

  // Settled installment periods, keyed "<installmentId>:<periodNo>".
  const paidKeys = useMemo(
    () => new Set((payments ?? []).map((p) => `${p.installment_id}:${p.period_no}`)),
    [payments],
  )

  function installmentPeriodOf(t: Transaction) {
    if (t.source !== 'installment' || !t.from_card_id) return null
    return parsePeriodSourceKey(t.source_key)
  }

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

  // Unconfirmed (generated, unreviewed) rows are excluded from every total (§6.6).
  const confirmed = useMemo(() => (transactions ?? []).filter((t) => t.confirmed), [transactions])

  const matchesCategory = (t: Transaction) => {
    if (!categoryId) return true
    if (t.category_id === categoryId) return true
    const category = t.category_id ? categoryById.get(t.category_id) : null
    return category != null && effectiveMainId(category) === categoryId
  }
  const matchesAccount = (t: Transaction) =>
    !accountId || t.from_account_id === accountId || t.to_account_id === accountId
  const matchesCard = (t: Transaction) => !card || t.from_card_id === card.id || t.to_card_id === card.id
  const matchesSearch = (t: Transaction) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const category = t.category_id ? categoryById.get(t.category_id) : null
    const haystack = [t.note, t.description, category?.name, instrumentName?.[`account:${t.from_account_id}`], instrumentName?.[`card:${t.from_card_id}`]]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  }

  const filtered = confirmed.filter(
    (t) =>
      matchesPersonFilter(t, sharesByTxn, person) &&
      matchesCategory(t) &&
      matchesAccount(t) &&
      matchesCard(t) &&
      matchesSearch(t),
  )
  // D14: day totals below are what this person Borne, not the face value of
  // what they're merely listed on — full amounts would double-count a
  // shared row across both people's totals and break "A + B = All". The
  // month/category totals this fed also drive RecordsSummary now, which
  // derives them itself from the same `month`/`person`/`card`/`cardCycle`.
  const borneOf = (t: Transaction) => (person === 'all' ? t.amount : borneAmount(t, sharesByTxn, person))

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

  const filterCategory = categoryId ? categoryById.get(categoryId) : null

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      {/* One line (DESIGN §7.1 v3.5): the planning figures are the reason to
          open Records, but the daily habit is "jot → check the list", so the
          summary can't push the first transaction off the screen. On
          desktop this same component renders in AppShell's summary column
          instead (App.tsx), so it isn't rendered twice. */}
      {!isDesktop && <RecordsSummary month={month} person={person} card={card} cardCycle={cardCycle} />}

      <ReviewStrip onEdit={setEditing} />
      {filterCategory && (
        <button
          onClick={onClearCategory}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-foreground"
        >
          <CategoryIcon icon={filterCategory.icon} color={filterCategory.color} className="size-3.5" />
          {filterCategory.name}
          <X className="size-3" aria-label="Clear category filter" />
        </button>
      )}
      {accountId && (
        <button
          onClick={onClearAccount}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-foreground"
        >
          {instrumentName?.[`account:${accountId}`] ?? 'Account'}
          <X className="size-3" aria-label="Clear account filter" />
        </button>
      )}
      {card && (
        <button
          onClick={onClearCard}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-foreground"
        >
          {card.name}
          <X className="size-3" aria-label="Clear card filter" />
        </button>
      )}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month.</p>}
      {/* One continuous ledger rather than a card per row (Money Manager
          density): day headers carry that day's totals, and hairline
          dividers replace the per-row borders and gaps. */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {groups.map(([date, items], groupIndex) => {
          const dayIncome = items.filter((t) => t.kind === 'income').reduce((s, t) => s + borneOf(t), 0)
          const dayExpense = items.filter((t) => t.kind === 'expense').reduce((s, t) => s + borneOf(t), 0)
          return (
            <div key={date} className={groupIndex > 0 ? 'border-t' : undefined}>
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1">
                <span className="text-sm font-semibold tabular-nums">{dayOfMonthLabel(date)}</span>
                <span className="rounded bg-background px-1.5 py-px text-[10px] text-muted-foreground">
                  {weekdayLabel(date)}
                </span>
                <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
                  {dayIncome > 0 && (
                    <span className="text-good">{formatBaht(dayIncome)}</span>
                  )}
                  {dayExpense > 0 && <span className="text-destructive">{formatBaht(dayExpense)}</span>}
                </span>
              </div>

              <ul>
                {items.map((t) => {
                  const category = t.category_id ? categoryById.get(t.category_id) : null
                  const owner = t.owner_id ? memberById.get(t.owner_id) : null
                  const catPath = category ? categoryPath(category, categories ?? []) : null
                  const title =
                    t.kind === 'transfer'
                      ? `${instrumentLabel(t, 'from')} → ${instrumentLabel(t, 'to')}`
                      : t.note || catPath || t.kind
                  // Category only repeats below when it isn't already the title.
                  const details = [catPath === title ? null : catPath, instrumentLabel(t, 'from'), owner?.display_name]
                    .filter(Boolean)
                    .join(' · ')
                  // Under a specific person's filter, a shared row's full
                  // amount stays the headline (the coffee cost what it cost)
                  // and their own portion shows underneath — showing only the
                  // portion would misstate what the thing cost.
                  const mine = person !== 'all' ? borneAmount(t, sharesByTxn, person) : null
                  const period = installmentPeriodOf(t)
                  const periodKey = period ? `${period.installmentId}:${period.periodNo}` : null
                  const periodPaid = periodKey != null && paidKeys.has(periodKey)
                  return (
                    <li key={t.id} className="border-t">
                      <SwipeableRow onDelete={() => setConfirmingDelete(t)}>
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
                                <span className={cn('truncate text-sm', periodPaid && 'text-muted-foreground')}>
                                  {title}
                                  {t.description && <span className="text-muted-foreground"> — {t.description}</span>}
                                </span>
                                {!t.confirmed && (
                                  <span className="shrink-0 rounded-full bg-warning px-1.5 text-[10px] text-warning-foreground">
                                    Pending
                                  </span>
                                )}
                              </span>
                              {(details || (mine != null && mine > 0 && mine < t.amount)) && (
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {details}
                                  {mine != null && mine > 0 && mine < t.amount && (details ? ` · yours ${formatBaht(mine)}` : `yours ${formatBaht(mine)}`)}
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 text-sm tabular-nums',
                                t.kind === 'income'
                                  ? 'text-good'
                                  : t.kind === 'expense'
                                    ? 'text-destructive'
                                    : 'text-muted-foreground',
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
                                    ? 'border-good bg-good text-white'
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
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this transaction?"
          description="Removes it from every total. You'll have a few seconds to undo right after."
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  )
}
