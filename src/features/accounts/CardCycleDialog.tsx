import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetCardCycleAdjustment, useCardCycleAdjustments } from '@/lib/cardCycleAdjustments'
import { cycleBill, cycleOf } from '@/lib/finance/billingCycle'
import { formatBaht } from '@/lib/format'
import { useHousehold } from '@/lib/HouseholdContext'
import { useInstallments } from '@/lib/installments'
import { useTransactions } from '@/lib/transactions'
import type { Card } from '@/lib/cards'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  card: Card
  onClose: () => void
}

export function CardCycleDialog({ card, onClose }: Props) {
  const { householdId } = useHousehold()
  const cycle = useMemo(() => cycleOf(card, today()), [card])
  const { data: transactions } = useTransactions(householdId, { start: cycle.start, end: cycle.end })
  const { data: installments } = useInstallments(householdId)
  const { data: adjustments } = useCardCycleAdjustments(householdId)
  const setAdjustment = useSetCardCycleAdjustment(householdId)

  const [editingAdjustment, setEditingAdjustment] = useState(false)
  const existingAdjustment = (adjustments ?? []).find((a) => a.card_id === card.id && a.cycle_start === cycle.start)
  const [adjustmentAmount, setAdjustmentAmount] = useState(String(existingAdjustment?.amount ?? '0'))
  const [adjustmentNote, setAdjustmentNote] = useState(existingAdjustment?.note ?? '')

  const cardTransactions = (transactions ?? []).filter(
    (t) => t.from_card_id === card.id || t.to_card_id === card.id,
  )
  const cardInstallments = (installments ?? []).filter((i) => i.card_id === card.id && i.status === 'active')

  const bill = cycleBill(cycle, card.id, cardTransactions, cardInstallments, existingAdjustment?.amount ?? null)
  const utilization = card.credit_limit > 0 ? Math.min(100, (bill / card.credit_limit) * 100) : 0

  async function saveAdjustment() {
    await setAdjustment.mutateAsync({
      cardId: card.id,
      cycleStart: cycle.start,
      amount: Number(adjustmentAmount),
      note: adjustmentNote || null,
    })
    setEditingAdjustment(false)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-linear-to-br from-secondary/50 via-card to-accent/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">Current cycle ({cycle.start} – {cycle.end})</p>
            <p className="mt-1 text-2xl font-semibold">{formatBaht(bill)}</p>
            <p className="text-xs text-muted-foreground">Due {cycle.dueDate}</p>
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

          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              Card transactions this cycle: {formatBaht(cardTransactions.filter((t) => t.date >= cycle.start && t.date <= cycle.end && !(t.kind === 'transfer' && t.to_card_id === card.id)).reduce((s, t) => s + t.amount, 0))}
            </p>
            {cardInstallments.length > 0 && (
              <p className="text-muted-foreground">Installment plans billed here: {cardInstallments.length}</p>
            )}
          </div>

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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
