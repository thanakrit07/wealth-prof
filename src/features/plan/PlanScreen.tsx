import { useMemo, useState } from 'react'
import { Plus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { InstallmentsScreen } from '@/features/installments/InstallmentsScreen'
import { useCardCycleAdjustments } from '@/lib/cardCycleAdjustments'
import { useCards } from '@/lib/cards'
import { useHousehold } from '@/lib/HouseholdContext'
import { formatBaht } from '@/lib/format'
import { cycleBill, cycleOf, periodDate } from '@/lib/finance/billingCycle'
import { nextOccurrence } from '@/lib/finance/recurrence'
import { useInstallmentPayments, useInstallments, usePostedPeriods } from '@/lib/installments'
import { ALL_TIME, dayMonthLabel } from '@/lib/month'
import { useRecurringRules, useUpdateRecurringRule, type RecurringRule } from '@/lib/recurring'
import { useTransactions } from '@/lib/transactions'
import { CardForecastTab } from './CardForecastTab'
import { RecurringRuleSheet } from './RecurringRuleSheet'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// How far ahead "Coming up" looks — enough to answer "what's due soon"
// without turning into a second forecast tab (CardForecastTab already
// covers the long horizon, month by month).
const HORIZON_DAYS = 45

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function scheduleLabel(rule: RecurringRule): string {
  const every = rule.interval > 1 ? `Every ${rule.interval} ` : ''
  if (rule.freq === 'weekly') {
    return `${every}${rule.interval > 1 ? 'weeks' : 'Weekly'} · ${WEEKDAYS[rule.weekday ?? 0]}`
  }
  if (rule.freq === 'monthly') {
    return `${every}${rule.interval > 1 ? 'months' : 'Monthly'} · day ${rule.day_of_month}`
  }
  return `${every}${rule.interval > 1 ? 'years' : 'Yearly'} · ${rule.day_of_month} ${MONTHS[(rule.month_of_year ?? 1) - 1]}`
}

// Approximate monthly equivalent, for the fixed-costs summary.
function monthlyEquivalent(rule: RecurringRule): number {
  if (rule.freq === 'monthly') return rule.amount / rule.interval
  if (rule.freq === 'weekly') return (rule.amount * 52) / 12 / rule.interval
  return rule.amount / 12 / rule.interval
}

interface TimelineRow {
  key: string
  date: string
  label: string
  sublabel: string
  posted: number
  projected: number
  rule?: RecurringRule
}

// v3.9: a single forward timeline, organised by purpose (what's coming, then
// how to manage it) instead of by entity (a tab per plan type, each
// answering a slightly different question). Merges every card's next bill
// with every account-billed recurring occurrence and installment period due
// within the horizon — Posted (installment periods, unescapable) shown
// solid, Projected (recurring, cancellable) as a lighter extension, same as
// CardForecastTab. This also closes the gap where a card-billed
// subscription's cost was silently counted twice: once inside its card's
// own bill, once again inside Recurring's "Fixed costs" — Fixed costs now
// excludes anything billed to a card, since that's covered here instead.
function ComingUpSection({ onEditRecurring }: { onEditRecurring: (rule: RecurringRule) => void }) {
  const { householdId } = useHousehold()
  const { data: cards } = useCards(householdId)
  const { data: installments } = useInstallments(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const { data: postedPeriods } = usePostedPeriods(householdId)
  const { data: adjustments } = useCardCycleAdjustments(householdId)
  const { data: rules } = useRecurringRules(householdId)
  const { data: transactions } = useTransactions(householdId, ALL_TIME)

  const today = todayIso()
  const horizon = addDaysIso(today, HORIZON_DAYS)

  const paidCountByInstallment = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments ?? []) map.set(p.installment_id, (map.get(p.installment_id) ?? 0) + 1)
    return map
  }, [payments])

  const rows = useMemo<TimelineRow[]>(() => {
    const list: TimelineRow[] = []
    const allTxns = transactions ?? []

    // Each active card's next bill — always shown, however far its due
    // date is, since it's the single most relevant fact for that card.
    for (const card of (cards ?? []).filter((c) => !c.archived)) {
      const cycle = cycleOf(card, today)
      const cardTxns = allTxns.filter((t) => (t.from_card_id === card.id || t.to_card_id === card.id) && t.confirmed)
      const cardInstallments = (installments ?? []).filter((i) => i.card_id === card.id && i.status === 'active')
      const adjustment = (adjustments ?? []).find((a) => a.card_id === card.id && a.cycle_start === cycle.start)
      const posted = cycleBill({
        cycle,
        cardId: card.id,
        transactions: cardTxns,
        installments: cardInstallments,
        adjustment: adjustment?.amount ?? null,
        postedPeriods: postedPeriods?.keys ?? new Set(),
      })
      const total = cycleBill({
        cycle,
        cardId: card.id,
        transactions: cardTxns,
        installments: cardInstallments,
        adjustment: adjustment?.amount ?? null,
        postedPeriods: postedPeriods?.keys ?? new Set(),
        recurringRules: rules ?? [],
      })
      if (total <= 0) continue
      list.push({
        key: `card:${card.id}`,
        date: cycle.dueDate,
        label: card.name,
        sublabel: `Due ${dayMonthLabel(cycle.dueDate)}`,
        posted,
        projected: total - posted,
      })
    }

    // Recurring occurrences not billed to a card — a card-billed rule's
    // next charge already lives inside that card's row above.
    for (const rule of (rules ?? []).filter((r) => r.active && !r.from_card_id)) {
      const next = nextOccurrence(rule, today)
      if (!next || next > horizon) continue
      list.push({
        key: `recurring:${rule.id}`,
        date: next,
        label: rule.name,
        sublabel: `${rule.kind === 'income' ? '+' : '-'}${formatBaht(rule.amount)} projected`,
        posted: 0,
        projected: rule.kind === 'income' ? 0 : rule.amount,
        rule,
      })
    }

    // Installment periods not billed to a card — Posted, since they're
    // already a real row in the ledger (card-billed periods are folded
    // into their card's cycle bill above instead).
    for (const inst of (installments ?? []).filter((i) => i.status === 'active' && !i.card_id)) {
      const paid = paidCountByInstallment.get(inst.id) ?? 0
      if (paid >= inst.total_periods) continue
      const date = periodDate(inst.start_date, paid + 1)
      if (date > horizon) continue
      list.push({
        key: `installment:${inst.id}:${paid + 1}`,
        date,
        label: inst.name,
        sublabel: `Period ${paid + 1}/${inst.total_periods} posted`,
        posted: inst.monthly_amount,
        projected: 0,
      })
    }

    return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }, [cards, installments, paidCountByInstallment, postedPeriods, adjustments, rules, transactions, today, horizon])

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing due soon.</p>
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((row) => {
        const amount = (
          <span className="shrink-0">
            {row.posted > 0 && formatBaht(row.posted)}
            {row.posted > 0 && row.projected > 0 && <span className="text-muted-foreground"> + </span>}
            {row.projected > 0 && <span className={row.posted > 0 ? 'text-muted-foreground' : undefined}>{formatBaht(row.projected)}</span>}
          </span>
        )
        return (
          <li key={row.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            {row.rule ? (
              <button onClick={() => onEditRecurring(row.rule!)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.sublabel}</span>
                </span>
                {amount}
              </button>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.sublabel}</span>
                </span>
                {amount}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RecurringTab() {
  const { householdId } = useHousehold()
  const { data: rules } = useRecurringRules(householdId)
  const updateRule = useUpdateRecurringRule(householdId)
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)

  const active = (rules ?? []).filter((r) => r.active)
  // Card-billed rules are counted in Card bills' Projected figure instead —
  // counting them here too would be the same charge twice.
  const monthlyExpense = active
    .filter((r) => r.kind === 'expense' && !r.from_card_id)
    .reduce((s, r) => s + monthlyEquivalent(r), 0)
  const monthlyIncome = active.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-linear-to-br from-secondary/50 via-card to-accent/40 p-4 shadow-sm">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">Recurring per month (approx.)</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div>
            <dt className="text-xs text-muted-foreground">Income</dt>
            <dd className="text-good">{formatBaht(monthlyIncome)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fixed costs</dt>
            <dd>{formatBaht(monthlyExpense)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-[11px] text-muted-foreground">Card-billed subscriptions count in Card bills below, not here.</p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-medium text-muted-foreground">Recurring rules</h2>
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        <ul className="space-y-1.5">
          {(rules ?? []).map((rule) => {
            const next = rule.active ? nextOccurrence(rule, todayIso()) : null
            return (
              <li key={rule.id} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
                <Repeat className="size-4 shrink-0 text-muted-foreground" />
                <button onClick={() => setEditing(rule)} className="min-w-0 flex-1 text-left">
                  <span className={rule.active ? 'block truncate text-sm' : 'block truncate text-sm text-muted-foreground line-through'}>
                    {rule.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {scheduleLabel(rule)}
                    {next && ` · next ${next}`}
                  </span>
                </button>
                <span className={rule.kind === 'income' ? 'text-sm text-good' : 'text-sm'}>
                  {rule.kind === 'income' ? '+' : rule.kind === 'expense' ? '-' : ''}
                  {formatBaht(rule.amount)}
                </span>
                <Switch
                  checked={rule.active}
                  onCheckedChange={(checked) => updateRule.mutate({ id: rule.id, input: { active: checked } })}
                  aria-label={`${rule.name} active`}
                />
              </li>
            )
          })}
          {rules?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No recurring rules yet. Add salary, insurance, subscriptions — they'll be recorded automatically on schedule.
            </p>
          )}
        </ul>
      </section>

      {editing && (
        <RecurringRuleSheet
          key={editing === 'new' ? 'new' : editing.id}
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// D-0004: no sub-tabs — everything sits on one scrollable screen, so a plan
// is one tap from the FAB instead of two. v3.9 reorganises it by purpose:
// Coming up (what's due, merged across every plan type) leads, and the
// per-type management lists — Card bills, Recurring rules, Installments —
// sit below for editing what generates those rows.
export function PlanScreen() {
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <section className="space-y-2">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">Coming up</h2>
        <ComingUpSection onEditRecurring={setEditingRule} />
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-sm font-medium text-muted-foreground">Card bills</h2>
        <CardForecastTab />
      </section>
      <section>
        <RecurringTab />
      </section>
      <section>
        <InstallmentsScreen />
      </section>

      {editingRule && <RecurringRuleSheet rule={editingRule} onClose={() => setEditingRule(null)} />}
    </div>
  )
}
