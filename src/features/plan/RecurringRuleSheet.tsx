import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AmountField } from '@/components/AmountField'
import { InstrumentSelect, type Instrument } from '@/components/InstrumentSelect'
import { Keypad } from '@/components/Keypad'
import { OwnerSelect } from '@/components/OwnerSelect'
import { useAmountEntry } from '@/hooks/useAmountEntry'
import { useCategories } from '@/lib/categories'
import { useHousehold } from '@/lib/HouseholdContext'
import type { MonthEndRule, RecurrenceFreq } from '@/lib/finance/recurrence'
import {
  useCreateRecurringRule,
  useDeleteRecurringRule,
  useUpdateRecurringRule,
  type RecurringRule,
  type RecurringRuleInput,
} from '@/lib/recurring'
import type { TransactionKind } from '@/lib/transactions'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  rule: RecurringRule | null
  onClose: () => void
}

export function RecurringRuleSheet({ rule, onClose }: Props) {
  const { householdId, self } = useHousehold()
  const { data: categories } = useCategories(householdId)
  const create = useCreateRecurringRule(householdId)
  const update = useUpdateRecurringRule(householdId)
  const remove = useDeleteRecurringRule(householdId)

  const [name, setName] = useState(rule?.name ?? '')
  const [kind, setKind] = useState<TransactionKind>(rule?.kind ?? 'expense')
  const amount = useAmountEntry(rule ? String(rule.amount) : '')
  const [keypadOpen, setKeypadOpen] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null)
  const [from, setFrom] = useState<Instrument>({
    accountId: rule?.from_account_id ?? null,
    cardId: rule?.from_card_id ?? null,
  })
  const [to, setTo] = useState<Instrument>({
    accountId: rule?.to_account_id ?? null,
    cardId: rule?.to_card_id ?? null,
  })
  // Same trap as TransactionSheet: null means "shared" (§4.2), so a nullish
  // fallback would quietly reassign a shared rule to whoever edits it.
  const [ownerId, setOwnerId] = useState<string | null>(rule ? rule.owner_id : self.id)
  const [freq, setFreq] = useState<RecurrenceFreq>(rule?.freq ?? 'monthly')
  const [interval, setIntervalValue] = useState(String(rule?.interval ?? 1))
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.day_of_month ?? 1))
  const [monthOfYear, setMonthOfYear] = useState(String(rule?.month_of_year ?? 1))
  const [weekday, setWeekday] = useState(String(rule?.weekday ?? 1))
  const [monthEnd, setMonthEnd] = useState<MonthEndRule>(rule?.month_end ?? 'clamp')
  const [startDate, setStartDate] = useState(rule?.start_date ?? today())
  const [endDate, setEndDate] = useState(rule?.end_date ?? '')
  const [autoPost, setAutoPost] = useState(rule?.auto_post ?? false)
  const [variableAmount, setVariableAmount] = useState(rule?.variable_amount ?? false)
  const [active, setActive] = useState(rule?.active ?? true)

  const flatCategories = (categories ?? []).filter((c) => !c.archived && c.kind === kind)
  // Mains followed immediately by their own subs (D10) — a flat dropdown
  // still needs to read as a hierarchy, not a shuffled list.
  const relevantCategories = flatCategories
    .filter((c) => c.parent_id === null)
    .flatMap((main) => [main, ...flatCategories.filter((c) => c.parent_id === main.id)])

  const canSave =
    name.trim().length > 0 &&
    amount.value > 0 &&
    Number(interval) > 0 &&
    Boolean(from.accountId || from.cardId) &&
    (kind === 'transfer' ? Boolean(to.accountId || to.cardId) : Boolean(categoryId)) &&
    (freq === 'weekly' || (Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 31))

  function changeKind(next: TransactionKind) {
    setKind(next)
    const current = categories?.find((c) => c.id === categoryId)
    if (current && current.kind !== next) setCategoryId(null)
  }

  async function handleSave() {
    const input: RecurringRuleInput = {
      name: name.trim(),
      kind,
      category_id: kind === 'transfer' ? null : categoryId,
      category_kind: kind === 'transfer' ? null : (kind as 'income' | 'expense'),
      amount: amount.value,
      owner_id: ownerId,
      from_account_id: from.accountId,
      from_card_id: from.cardId,
      to_account_id: kind === 'transfer' ? to.accountId : null,
      to_card_id: kind === 'transfer' ? to.cardId : null,
      note: null,
      freq,
      interval: Number(interval),
      day_of_month: freq === 'weekly' ? null : Number(dayOfMonth),
      month_of_year: freq === 'yearly' ? Number(monthOfYear) : null,
      weekday: freq === 'weekly' ? Number(weekday) : null,
      month_end: monthEnd,
      start_date: startDate,
      end_date: endDate || null,
      max_occurrences: null,
      auto_post: autoPost,
      variable_amount: variableAmount,
      active,
    }
    if (rule) {
      await update.mutateAsync({ id: rule.id, input })
    } else {
      await create.mutateAsync(input)
    }
    onClose()
  }

  async function handleDelete() {
    if (!rule) return
    await remove.mutateAsync(rule.id)
    onClose()
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{rule ? 'Edit recurring rule' : 'New recurring rule'}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            {/* No autoFocus: opening the system keyboard the instant the sheet
                mounts is what shoved the whole sheet off-screen on iOS
                (DESIGN §7.2 D9 — same bug the amount keypad exists to avoid).
                Tapping the field remains a deliberate, expected keyboard open. */}
            <Input id="rule-name" placeholder="Salary, Netflix, Car insurance…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <Tabs value={kind} onValueChange={(v) => changeKind(v as TransactionKind)}>
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">Expense</TabsTrigger>
              <TabsTrigger value="income" className="flex-1">Income</TabsTrigger>
              <TabsTrigger value="transfer" className="flex-1">Transfer</TabsTrigger>
            </TabsList>
          </Tabs>

          <AmountField label="Amount" expr={amount.expr} active={keypadOpen} onActivate={() => setKeypadOpen(true)} />

          {kind !== 'transfer' && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId ?? ''} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {relevantCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.parent_id ? `↳ ${c.name}` : c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{kind === 'transfer' ? 'From' : 'Account / card'}</Label>
            <InstrumentSelect value={from} onChange={setFrom} />
          </div>

          {kind === 'transfer' && (
            <div className="space-y-1.5">
              <Label>To</Label>
              <InstrumentSelect value={to} onChange={setTo} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Owner</Label>
            <OwnerSelect value={ownerId} onChange={setOwnerId} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as RecurrenceFreq)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-interval">Every N {freq === 'weekly' ? 'weeks' : freq === 'monthly' ? 'months' : 'years'}</Label>
              <Input id="rule-interval" type="number" min={1} value={interval} onChange={(e) => setIntervalValue(e.target.value)} />
            </div>
          </div>

          {freq === 'weekly' ? (
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => (
                    <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {freq === 'yearly' && (
                <div className="space-y-1.5">
                  <Label>Month</Label>
                  <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="rule-day">Day of month</Label>
                <Input id="rule-day" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
              </div>
              {Number(dayOfMonth) > 28 && (
                <div className="space-y-1.5">
                  <Label>Short months</Label>
                  <Select value={monthEnd} onValueChange={(v) => setMonthEnd(v as MonthEndRule)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clamp">Use last day</SelectItem>
                      <SelectItem value="skip">Skip month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-start">Starts</Label>
              <Input id="rule-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-end">Ends (optional)</Label>
              <Input id="rule-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="rule-autopost">Post automatically</Label>
                <p className="text-xs text-muted-foreground">Counts immediately, no review needed</p>
              </div>
              <Switch id="rule-autopost" checked={autoPost} onCheckedChange={setAutoPost} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="rule-variable">Amount varies</Label>
                <p className="text-xs text-muted-foreground">e.g. utilities — always asks for review</p>
              </div>
              <Switch id="rule-variable" checked={variableAmount} onCheckedChange={setVariableAmount} />
            </div>
            {rule && (
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="rule-active">Active</Label>
                <Switch id="rule-active" checked={active} onCheckedChange={setActive} />
              </div>
            )}
          </div>

          {rule && (
            <p className="text-xs text-muted-foreground">
              Changes apply to future occurrences only — entries already recorded stay as they are.
            </p>
          )}

        </div>

        <DrawerFooter>
          {keypadOpen ? (
            <Keypad onKey={amount.press} onEquals={amount.pressEquals} onDone={() => setKeypadOpen(false)} />
          ) : (
            <div className="flex gap-2">
              {rule && (
                <Button variant="outline" size="icon" onClick={handleDelete} aria-label="Delete rule">
                  <Trash2 className="size-4" />
                </Button>
              )}
              <Button className="flex-1" onClick={handleSave} disabled={!canSave || create.isPending || update.isPending}>
                Save
              </Button>
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
