import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryIcon } from '@/lib/categoryIcons'
import { useCategories } from '@/lib/categories'
import { useSetCardCycleAdjustment, useCardCycleAdjustments } from '@/lib/cardCycleAdjustments'
import { addDays, cycleBill, cycleOf } from '@/lib/finance/billingCycle'
import { formatBaht } from '@/lib/format'
import { useHousehold } from '@/lib/HouseholdContext'
import { useInstallmentPayments, useInstallments } from '@/lib/installments'
import { dayMonthLabel } from '@/lib/month'
import { useRecurringRules } from '@/lib/recurring'
import { useTransactions } from '@/lib/transactions'
import type { Card } from '@/lib/cards'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  card: Card
  /** Any date inside the cycle to open on; defaults to the current cycle. */
  initialDate?: string
  onClose: () => void
}

// Card statement view (DESIGN.md §7.3, D11): transactions grouped by
// billing cycle, newest first — the in-app version of the old sheet's
// per-cycle summary. Auto-posted installment periods (InstallmentMaterialiser)
// sit in the same list as manual spends, tagged by their own description
// ("Notebook (4/10)"), so the list reads like the issuer's statement.
export function CardCycleDialog({ card, initialDate, onClose }: Props) {
  const { householdId } = useHousehold()
  // The date used to compute the visible cycle — navigated a day at a time
  // past the cycle boundary so cycleOf() lands in the next/previous cycle.
  const [anchorDate, setAnchorDate] = useState(initialDate ?? today())
  const cycle = useMemo(() => cycleOf(card, anchorDate), [card, anchorDate])
  const isCurrentCycle = cycleOf(card, today()).start === cycle.start

  const { data: transactions } = useTransactions(householdId, { start: cycle.start, end: cycle.end })
  const { data: installments } = useInstallments(householdId)
  const { data: payments } = useInstallmentPayments(householdId)
  const { data: categories } = useCategories(householdId)
  const { data: adjustments } = useCardCycleAdjustments(householdId)
  const { data: rules } = useRecurringRules(householdId)
  const setAdjustment = useSetCardCycleAdjustment(householdId)

  const [editingAdjustment, setEditingAdjustment] = useState(false)
  const existingAdjustment = (adjustments ?? []).find((a) => a.card_id === card.id && a.cycle_start === cycle.start)
  const [adjustmentAmount, setAdjustmentAmount] = useState(String(existingAdjustment?.amount ?? '0'))
  const [adjustmentNote, setAdjustmentNote] = useState(existingAdjustment?.note ?? '')

  const cardTransactions = (transactions ?? [])
    .filter((t) => t.from_card_id === card.id || t.to_card_id === card.id)
    .filter((t) => t.confirmed)
  const cardInstallments = (installments ?? []).filter((i) => i.card_id === card.id && i.status === 'active')
  const paidPeriods = new Set((payments ?? []).map((p) => `${p.installment_id}:${p.period_no}`))

  const bill = cycleBill({
    cycle,
    cardId: card.id,
    transactions: cardTransactions,
    installments: cardInstallments,
    adjustment: existingAdjustment?.amount ?? null,
    paidPeriods,
    recurringRules: rules ?? [],
  })
  const paidSoFar = cardTransactions
    .filter((t) => t.kind === 'transfer' && t.to_card_id === card.id)
    .reduce((sum, t) => sum + t.amount, 0)
  const utilization = card.credit_limit > 0 ? Math.min(100, (bill / card.credit_limit) * 100) : 0

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]))
  const chargeRows = cardTransactions
    .filter((t) => !(t.kind === 'transfer' && t.to_card_id === card.id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const paymentRows = cardTransactions.filter((t) => t.kind === 'transfer' && t.to_card_id === card.id)

  async function saveAdjustment() {
    await setAdjustment.mutateAsync({
      cardId: card.id,
      cycleStart: cycle.start,
      amount: Number(adjustmentAmount),
      note: adjustmentNote || null,
    })
    setEditingAdjustment(false)
  }

  function goToCycle(delta: 1 | -1) {
    setAnchorDate(delta === 1 ? addDays(cycle.end, 1) : addDays(cycle.start, -1))
    setEditingAdjustment(false)
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{card.name}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="rounded-xl border bg-linear-to-br from-secondary/50 via-card to-accent/40 p-3 text-center">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="size-7" onClick={() => goToCycle(-1)} aria-label="Previous cycle">
                <ChevronLeft className="size-4" />
              </Button>
              <p className="text-xs font-medium">
                {dayMonthLabel(cycle.start)} – {dayMonthLabel(cycle.end)}
                {isCurrentCycle && <span className="text-muted-foreground"> · current</span>}
              </p>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => goToCycle(1)} aria-label="Next cycle">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <p className="mt-1 text-2xl font-semibold">{formatBaht(bill)}</p>
            <p className="text-xs text-muted-foreground">
              Due {dayMonthLabel(cycle.dueDate)}
              {paidSoFar > 0 && ` · ${formatBaht(paidSoFar)} paid`}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Used</span>
              <span>{formatBaht(card.credit_limit)} limit</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={utilization >= 80 ? 'h-full rounded-full bg-destructive' : 'h-full rounded-full bg-primary/70'}
                style={{ width: `${utilization}%` }}
              />
            </div>
          </div>

          <ul className="space-y-1">
            {chargeRows.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <CategoryIcon icon={categoryById.get(t.category_id ?? '')?.icon ?? null} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{t.description || categoryById.get(t.category_id ?? '')?.name || t.kind}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{dayMonthLabel(t.date)}</span>
                <span className="shrink-0 font-medium">{formatBaht(t.amount)}</span>
              </li>
            ))}
            {chargeRows.length === 0 && <p className="text-sm text-muted-foreground">No charges this cycle.</p>}
          </ul>

          {paymentRows.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Payments</p>
              <ul className="space-y-1">
                {paymentRows.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">Bill payment</span>
                    <span className="shrink-0 text-xs">{dayMonthLabel(t.date)}</span>
                    <span className="shrink-0 font-medium">{formatBaht(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!editingAdjustment ? (
            <button
              type="button"
              onClick={() => setEditingAdjustment(true)}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {existingAdjustment ? `Adjustment: ${formatBaht(existingAdjustment.amount)} — edit` : 'Reconcile to statement'}
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">
                Signed delta vs. the computed total, if the real statement differs.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="adj-amount">Adjustment amount</Label>
                <Input id="adj-amount" type="number" inputMode="decimal" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-note">Note</Label>
                <Input id="adj-note" value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingAdjustment(false)}>Cancel</Button>
                <Button size="sm" className="flex-1" onClick={saveAdjustment} disabled={setAdjustment.isPending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
