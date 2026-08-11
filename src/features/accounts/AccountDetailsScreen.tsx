import { useMemo, useState } from 'react'
import { ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FullScreenPage } from '@/components/FullScreenPage'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { SwipeableRow } from '@/components/SwipeableRow'
import { Button } from '@/components/ui/button'
import { useAccounts } from '@/lib/accounts'
import { CategoryIcon } from '@/lib/categoryIcons'
import { categoryPath, useCategories } from '@/lib/categories'
import { accountBalance } from '@/lib/finance/balances'
import { sharesByTransaction } from '@/lib/filters'
import { formatBaht } from '@/lib/format'
import { useHousehold } from '@/lib/HouseholdContext'
import { ALL_TIME, currentMonthKey, dayOfMonthLabel, monthLabel, monthRange, shiftMonth, weekdayLabel } from '@/lib/month'
import { useTransactionShares } from '@/lib/transactionShares'
import { useDeleteTransaction, useTransactions, type Transaction } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import { TransactionSheet } from '@/features/transactions/TransactionSheet'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  accountId: string
  onClose: () => void
}

// The complete truth for one account, month by month — a page in its own
// right (not a filtered view of Records), because Balance Adjustments filed
// under "Modified Bal" are deliberately excluded from Records itself
// (balanceAdjustments.ts) and need somewhere to actually be seen.
export function AccountDetailsScreen({ accountId, onClose }: Props) {
  const { householdId, members } = useHousehold()
  const { data: accounts } = useAccounts(householdId)
  const { data: allTimeTxns } = useTransactions(householdId, ALL_TIME)
  const [month, setMonth] = useState(currentMonthKey())
  const [pickerOpen, setPickerOpen] = useState(false)
  const range = useMemo(() => monthRange(month), [month])
  const { data: monthTxns } = useTransactions(householdId, range)
  const { data: categories } = useCategories(householdId)
  const { data: shares } = useTransactionShares(householdId)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<Transaction | null>(null)
  const remove = useDeleteTransaction(householdId)

  const account = (accounts ?? []).find((a) => a.id === accountId) ?? null
  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const sharesByTxn = useMemo(() => sharesByTransaction(shares), [shares])

  const items = useMemo(
    () => (monthTxns ?? []).filter((t) => t.confirmed && (t.from_account_id === accountId || t.to_account_id === accountId)),
    [monthTxns, accountId],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of items) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [items])

  async function handleDelete(t: Transaction) {
    await remove.mutateAsync(t.id)
    toast.success('Transaction deleted')
  }

  if (!account) return null

  return (
    <FullScreenPage
      title={account.name}
      onClose={onClose}
      headerActions={
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:bg-accent"
          >
            {monthLabel(month)}
          </button>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="text-2xl font-semibold">{formatBaht(accountBalance(account, allTimeTxns ?? [], todayIso()))}</p>
        </div>

        {groups.length === 0 && <p className="text-sm text-muted-foreground">No transactions this month.</p>}

        <div className="overflow-hidden rounded-xl border bg-card">
          {groups.map(([date, dayItems], groupIndex) => (
            <div key={date} className={groupIndex > 0 ? 'border-t' : undefined}>
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1">
                <span className="text-sm font-semibold tabular-nums">{dayOfMonthLabel(date)}</span>
                <span className="rounded bg-background px-1.5 py-px text-[10px] text-muted-foreground">{weekdayLabel(date)}</span>
              </div>
              <ul>
                {dayItems.map((t) => {
                  const category = t.category_id ? categoryById.get(t.category_id) : null
                  const isTransfer = t.kind === 'transfer'
                  const isOut = t.from_account_id === accountId
                  const catPath = category ? categoryPath(category, categories ?? []) : null
                  const title = isTransfer ? (isOut ? 'Transfer out' : 'Transfer in') : t.note || catPath || t.kind
                  // One dot per member who Bears part of this row (D13) —
                  // same colour convention as Settings/Balances, so a Split
                  // is visible here too, not just in Records.
                  const bearers = [...new Set((sharesByTxn.get(t.id) ?? []).filter((s) => s.share_amount > 0).map((s) => s.member_id))]
                    .map((id) => memberById.get(id))
                    .filter((m): m is (typeof members)[number] => m != null)
                  return (
                    <li key={t.id} className="border-t first:border-t-0">
                      <SwipeableRow onDelete={() => setConfirmingDelete(t)}>
                        <button
                          onClick={() => setEditing(t)}
                          className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left transition-colors active:bg-accent/60"
                        >
                          {isTransfer ? (
                            <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <CategoryIcon icon={category?.icon ?? null} color={category?.color} className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm">{title}</span>
                              {category?.system && (
                                <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                                  {category.name}
                                </span>
                              )}
                            </span>
                            {(catPath && catPath !== title) || bearers.length > 0 ? (
                              <span className="flex items-center gap-1">
                                {catPath && catPath !== title && (
                                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{catPath}</span>
                                )}
                                {bearers.length > 0 && (
                                  <span
                                    className="flex shrink-0 items-center gap-0.5"
                                    aria-label={`Shared with ${bearers.map((m) => m.display_name).join(', ')}`}
                                  >
                                    {bearers.map((m) => (
                                      <span key={m.id} className="size-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                                    ))}
                                  </span>
                                )}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-sm tabular-nums',
                              isTransfer ? 'text-muted-foreground' : t.kind === 'income' ? 'text-good' : 'text-destructive',
                            )}
                          >
                            {isTransfer ? (isOut ? '-' : '+') : t.kind === 'income' ? '+' : '-'}
                            {formatBaht(t.amount)}
                          </span>
                        </button>
                      </SwipeableRow>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {pickerOpen && (
        <MonthYearPicker
          month={month}
          onSelect={(m) => {
            setMonth(m)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {editing && <TransactionSheet open onOpenChange={(open) => !open && setEditing(null)} transaction={editing} />}
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this transaction?"
          description="Removes it from every total. You'll have a few seconds to undo right after."
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
    </FullScreenPage>
  )
}
