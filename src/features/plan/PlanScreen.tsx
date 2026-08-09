import { useState } from 'react'
import { Plus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { InstallmentsScreen } from '@/features/installments/InstallmentsScreen'
import { useHousehold } from '@/lib/HouseholdContext'
import { formatBaht } from '@/lib/format'
import { nextOccurrence } from '@/lib/finance/recurrence'
import { useRecurringRules, useUpdateRecurringRule, type RecurringRule } from '@/lib/recurring'
import { CardForecastTab } from './CardForecastTab'
import { RecurringRuleSheet } from './RecurringRuleSheet'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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

function RecurringTab() {
  const { householdId } = useHousehold()
  const { data: rules } = useRecurringRules(householdId)
  const updateRule = useUpdateRecurringRule(householdId)
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)

  const active = (rules ?? []).filter((r) => r.active)
  const monthlyExpense = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0)
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

// D-0004: no sub-tabs — everything already committed (card bills, plans,
// recurring rules) sits on one scrollable screen, so a plan is one tap from
// the FAB instead of two.
export function PlanScreen() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
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
    </div>
  )
}
