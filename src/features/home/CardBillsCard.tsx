import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { useCards, type Card } from '@/lib/cards'
import { useCardCycleAdjustments } from '@/lib/cardCycleAdjustments'
import { cycleBill, cycleDueInMonth, type Cycle } from '@/lib/finance/billingCycle'
import { formatBaht } from '@/lib/format'
import { useHousehold } from '@/lib/HouseholdContext'
import { useInstallmentPayments, useInstallments } from '@/lib/installments'
import { dayMonthLabel } from '@/lib/month'
import { useTransactions } from '@/lib/transactions'

interface Props {
  month: string
  onSelectCycle: (card: Card, cycle: Cycle) => void
}

// Overview §7.3 (v3.1): "how much cash do the cards need in month M".
// Each row is the cycle whose DUE DATE falls in M, so viewing next month
// answers "เดือนหน้าต้องเตรียมเท่าไหร่" — the today-anchored set-aside card
// this replaces could only ever show the current cycle.
export function CardBillsCard({ month, onSelectCycle }: Props) {
  const { householdId } = useHousehold()
  const { data: cards } = useCards(householdId)
  const { data: installments } = useInstallments(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const { data: adjustments } = useCardCycleAdjustments(householdId)

  const activeCards = useMemo(() => (cards ?? []).filter((c) => !c.archived), [cards])
  const cycles = useMemo(
    () => activeCards.map((card) => ({ card, cycle: cycleDueInMonth(card, month) })),
    [activeCards, month],
  )

  // One query spanning every card's cycle — the cards' statement days differ,
  // so the union is wider than the calendar month itself.
  const range = useMemo(() => {
    if (cycles.length === 0) return null
    return {
      start: cycles.reduce((min, c) => (c.cycle.start < min ? c.cycle.start : min), cycles[0].cycle.start),
      end: cycles.reduce((max, c) => (c.cycle.end > max ? c.cycle.end : max), cycles[0].cycle.end),
    }
  }, [cycles])
  const { data: transactions } = useTransactions(householdId, range ?? { start: month, end: month })

  const paidPeriods = useMemo(
    () => new Set((payments ?? []).map((p) => `${p.installment_id}:${p.period_no}`)),
    [payments],
  )

  const rows = useMemo(() => {
    return cycles
      .map(({ card, cycle }) => {
        const cardTxns = (transactions ?? []).filter(
          (t) => (t.from_card_id === card.id || t.to_card_id === card.id) && t.confirmed,
        )
        const cardInstallments = (installments ?? []).filter((i) => i.card_id === card.id && i.status === 'active')
        const adjustment = (adjustments ?? []).find((a) => a.card_id === card.id && a.cycle_start === cycle.start)
        const bill = cycleBill(cycle, card.id, cardTxns, cardInstallments, adjustment?.amount ?? null, paidPeriods)
        const paid = cardTxns
          .filter((t) => t.kind === 'transfer' && t.to_card_id === card.id && t.date >= cycle.start && t.date <= cycle.dueDate)
          .reduce((sum, t) => sum + t.amount, 0)
        return { card, cycle, bill, paid }
      })
      .filter((row) => row.bill > 0)
      .sort((a, b) => (a.cycle.dueDate < b.cycle.dueDate ? -1 : 1))
  }, [cycles, transactions, installments, adjustments, paidPeriods])

  if (rows.length === 0) return null

  const total = rows.reduce((sum, r) => sum + r.bill, 0)
  const totalPaid = rows.reduce((sum, r) => sum + Math.min(r.paid, r.bill), 0)
  const remaining = total - totalPaid

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h2 className="font-heading text-sm font-medium text-muted-foreground">Card bills due this month</h2>
        <p className="text-xl font-semibold">{formatBaht(remaining)}</p>
        {totalPaid > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatBaht(totalPaid)} already paid of {formatBaht(total)}
          </p>
        )}
      </div>
      <ul className="space-y-1">
        {rows.map(({ card, cycle, bill, paid }) => {
          const settled = paid >= bill
          return (
            <li key={card.id}>
              <button
                onClick={() => onSelectCycle(card, cycle)}
                className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left text-sm transition-colors active:bg-accent/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{card.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {dayMonthLabel(cycle.start)} – {dayMonthLabel(cycle.end)} · due {dayMonthLabel(cycle.dueDate)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block">{formatBaht(bill)}</span>
                  {settled ? (
                    <span className="block text-xs text-emerald-600 dark:text-emerald-400">paid</span>
                  ) : (
                    paid > 0 && <span className="block text-xs text-muted-foreground">{formatBaht(paid)} paid</span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
