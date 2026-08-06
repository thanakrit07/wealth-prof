import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCardCycleAdjustments } from '@/lib/cardCycleAdjustments'
import { useCards } from '@/lib/cards'
import { cycleBill, cycleDueInMonth, periodDate } from '@/lib/finance/billingCycle'
import { formatBaht } from '@/lib/format'
import { useHousehold } from '@/lib/HouseholdContext'
import { useInstallments, usePostedPeriods } from '@/lib/installments'
import { currentMonthKey, dayMonthLabel, monthLabel, shiftMonth, toBuddhistYear } from '@/lib/month'
import { useRecurringRules } from '@/lib/recurring'
import { useTransactions } from '@/lib/transactions'
import { cn } from '@/lib/utils'

// The default window straddles today: enough history to check the last few
// statements against reality, and the forward horizon the tab was built for.
const PAST_MONTHS = 3
const FUTURE_MONTHS = 6

/** 'recent' = the rolling window; otherwise a 4-digit year showing Jan–Dec. */
type ViewWindow = 'recent' | string

function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function rollingMonths(): string[] {
  const first = shiftMonth(currentMonthKey(), -PAST_MONTHS)
  return Array.from({ length: PAST_MONTHS + 1 + FUTURE_MONTHS }, (_, i) => shiftMonth(first, i))
}

// Forward calendar for credit cards (DESIGN.md §7.3 Plan): the in-app
// version of the sheet's per-card-per-cycle table, which SPEC §5 calls its
// single most valuable output. Rows are months (each showing the combined
// bill across every card) so the whole thing scrolls vertically on a phone;
// tapping a month opens the per-card breakdown.
//
// A future cycle has no recorded transactions yet, so its number is
// *committed* charges only — installment periods plus projected recurring
// charges — never a forecast of discretionary spending. The UI says so.
export function CardForecastTab() {
  const { householdId } = useHousehold()
  const { data: cards } = useCards(householdId)
  const { data: installments } = useInstallments(householdId)
  const { data: postedPeriods } = usePostedPeriods(householdId)
  const { data: adjustments } = useCardCycleAdjustments(householdId)
  const { data: rules } = useRecurringRules(householdId)

  const [includeRecurring, setIncludeRecurring] = useState(true)
  const [openMonth, setOpenMonth] = useState<string | null>(currentMonthKey())
  const [view, setView] = useState<ViewWindow>('recent')

  const months = useMemo(() => (view === 'recent' ? rollingMonths() : monthsOfYear(view)), [view])

  // Offered years come from the plans themselves — a plan's first and last
  // period bound the range where a card bill can exist — so the picker can
  // always reach every month the forecast has something to say about.
  const years = useMemo(() => {
    const now = new Date().getFullYear()
    const found = new Set<number>([now - 1, now, now + 1])
    for (const inst of installments ?? []) {
      found.add(Number(inst.start_date.slice(0, 4)))
      found.add(Number(periodDate(inst.start_date, inst.total_periods).slice(0, 4)))
    }
    return [...found].sort((a, b) => a - b).map(String)
  }, [installments])

  const activeCards = useMemo(() => (cards ?? []).filter((c) => !c.archived), [cards])

  // Every cycle in the window, so one transaction query can cover them all.
  const grid = useMemo(
    () => months.map((month) => ({ month, cells: activeCards.map((card) => ({ card, cycle: cycleDueInMonth(card, month) })) })),
    [months, activeCards],
  )
  const range = useMemo(() => {
    const all = grid.flatMap((row) => row.cells.map((c) => c.cycle))
    if (all.length === 0) return null
    return {
      start: all.reduce((min, c) => (c.start < min ? c.start : min), all[0].start),
      end: all.reduce((max, c) => (c.end > max ? c.end : max), all[0].end),
    }
  }, [grid])
  const { data: transactions } = useTransactions(householdId, range ?? { start: '', end: '' })

  const rows = useMemo(() => {
    return grid.map(({ month, cells }) => {
      const cards = cells
        .map(({ card, cycle }) => {
          const cardTxns = (transactions ?? []).filter(
            (t) => (t.from_card_id === card.id || t.to_card_id === card.id) && t.confirmed,
          )
          const cardInstallments = (installments ?? []).filter((i) => i.card_id === card.id && i.status === 'active')
          const adjustment = (adjustments ?? []).find((a) => a.card_id === card.id && a.cycle_start === cycle.start)
          const bill = cycleBill({
            cycle,
            cardId: card.id,
            transactions: cardTxns,
            installments: cardInstallments,
            adjustment: adjustment?.amount ?? null,
            postedPeriods: postedPeriods.keys,
            recurringRules: includeRecurring ? (rules ?? []) : undefined,
          })
          return { card, cycle, bill }
        })
        .filter((cell) => cell.bill > 0)
        .sort((a, b) => (a.cycle.dueDate < b.cycle.dueDate ? -1 : 1))
      return { month, cards, total: cards.reduce((sum, c) => sum + c.bill, 0) }
    })
  }, [grid, transactions, installments, adjustments, postedPeriods, rules, includeRecurring])

  const peak = Math.max(...rows.map((r) => r.total), 0)

  if (activeCards.length === 0) {
    return <p className="text-sm text-muted-foreground">No credit cards yet.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* The span, not the mode name — the picker already says the mode,
            and what's useful here is knowing how far the list actually runs. */}
        <p className="truncate text-sm text-muted-foreground">
          {monthLabel(months[0])} – {monthLabel(months[months.length - 1])}
        </p>
        <Select value={view} onValueChange={setView}>
          <SelectTrigger className="w-32 shrink-0" aria-label="Period shown"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recent</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={y}>{toBuddhistYear(Number(y))}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-card p-3">
        <div className="min-w-0 pr-3">
          <p className="text-sm">Include recurring</p>
          <p className="text-xs text-muted-foreground">
            Subscriptions and bills charged to a card, projected from their schedule
          </p>
        </div>
        <Switch checked={includeRecurring} onCheckedChange={setIncludeRecurring} aria-label="Include recurring charges" />
      </div>

      <ul className="space-y-1.5">
        {rows.map(({ month, cards, total }) => {
          const isOpen = openMonth === month
          const isPeak = total > 0 && total === peak
          // Past cycles are settled fact; future ones are committed charges
          // only. Same number, very different meaning — so the list says which.
          const isPast = month < currentMonthKey()
          return (
            <li key={month} className="overflow-hidden rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setOpenMonth(isOpen ? null : month)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors active:bg-accent/60"
              >
                <span className="flex-1 truncate font-medium">{monthLabel(month)}</span>
                {isPast && total > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">actual</span>
                )}
                {isPeak && (
                  <span className="shrink-0 rounded-full bg-warning px-1.5 text-[10px] text-warning-foreground">
                    highest
                  </span>
                )}
                <span className={cn('shrink-0', total === 0 && 'text-muted-foreground')}>{formatBaht(total)}</span>
                <ChevronDown
                  className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                />
              </button>

              {isOpen && (
                <ul className="divide-y border-t">
                  {cards.map(({ card, cycle, bill }) => (
                    <li key={card.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{card.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {dayMonthLabel(cycle.start)} – {dayMonthLabel(cycle.end)} · due {dayMonthLabel(cycle.dueDate)}
                        </span>
                      </span>
                      <span className="shrink-0">{formatBaht(bill)}</span>
                    </li>
                  ))}
                  {cards.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Nothing due this month.</li>
                  )}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {/* pr-20 keeps the text clear of the floating FAB: this tab's content is
          often shorter than the viewport, so it can't just be scrolled out. */}
      <p className="pr-20 text-xs text-muted-foreground">
        Past months show what was actually charged. Future months count committed charges only — installment
        periods and recurring rules — so day-to-day spending that hasn't happened yet is not included.
      </p>
    </div>
  )
}
