import { useMemo } from 'react'
import { useCards } from '@/lib/cards'
import { cycleBill, cycleOf } from '@/lib/finance/billingCycle'
import { formatBaht } from '@/lib/format'
import { useHousehold } from '@/lib/HouseholdContext'
import { useInstallments } from '@/lib/installments'
import { useCardCycleAdjustments } from '@/lib/cardCycleAdjustments'
import { useTransactions } from '@/lib/transactions'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysUntil(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - start) / 86_400_000)
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// DESIGN §6.5 secondary card: "set aside ฿X" — sum of cycleBill across
// every card whose next due date hasn't passed yet, listed by due date.
export function SetAsideCard() {
  const { householdId } = useHousehold()
  const { data: cards } = useCards(householdId)
  const { data: installments } = useInstallments(householdId)
  const { data: adjustments } = useCardCycleAdjustments(householdId)
  // A billing cycle is at most ~31 days; 35 days back safely covers the
  // current cycle's transactions for any statement day.
  const { data: transactions } = useTransactions(householdId, { start: daysAgoIso(35), end: today() })

  const rows = useMemo(() => {
    const activeCards = (cards ?? []).filter((c) => !c.archived)
    return activeCards
      .map((card) => {
        const cycle = cycleOf(card, today())
        const cardTxns = (transactions ?? []).filter((t) => t.from_card_id === card.id || t.to_card_id === card.id)
        const cardInstallments = (installments ?? []).filter((i) => i.card_id === card.id && i.status === 'active')
        const adjustment = (adjustments ?? []).find((a) => a.card_id === card.id && a.cycle_start === cycle.start)
        const bill = cycleBill(cycle, card.id, cardTxns, cardInstallments, adjustment?.amount ?? null)
        return { card, cycle, bill }
      })
      .filter((row) => row.bill > 0 && daysUntil(row.cycle.dueDate) >= 0)
      .sort((a, b) => (a.cycle.dueDate < b.cycle.dueDate ? -1 : 1))
  }, [cards, transactions, installments, adjustments])

  if (rows.length === 0) return null

  const total = rows.reduce((sum, r) => sum + r.bill, 0)

  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h2 className="font-heading text-sm font-medium text-muted-foreground">Set aside for the next billing cycle</h2>
        <p className="text-xl font-semibold">{formatBaht(total)}</p>
      </div>
      <ul className="space-y-1.5">
        {rows.map(({ card, cycle, bill }) => {
          const days = daysUntil(cycle.dueDate)
          return (
            <li key={card.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{card.name}</span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {formatBaht(bill)}
                <span className={days <= 3 ? 'text-destructive' : ''}>
                  {days === 0 ? 'due today' : days === 1 ? 'in 1 day' : `in ${days} days`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
