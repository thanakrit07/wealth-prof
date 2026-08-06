import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Switch } from '@/components/ui/switch'
import { AmountField } from '@/components/AmountField'
import { DateField } from '@/components/DateField'
import { InstrumentSelect, type Instrument } from '@/components/InstrumentSelect'
import { Keypad } from '@/components/Keypad'
import { OwnerSelect } from '@/components/OwnerSelect'
import { useAmountEntry } from '@/hooks/useAmountEntry'
import { useCategories } from '@/lib/categories'
import type { EntryPrefill } from '@/lib/entryPrefill'
import { useHousehold } from '@/lib/HouseholdContext'
import {
  useCreateInstallment,
  useDeleteInstallment,
  useUpdateInstallment,
  type Installment,
  type InstallmentInput,
} from '@/lib/installments'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  installment: Installment | null
  onClose: () => void
  // Set only when opened from Rep/Inst on the transaction form (D9) — what
  // was already typed there, carried over rather than retyped.
  prefill?: EntryPrefill
}

export function InstallmentSheet({ installment, onClose, prefill }: Props) {
  const { householdId } = useHousehold()
  const { data: categories } = useCategories(householdId)
  const create = useCreateInstallment(householdId)
  const update = useUpdateInstallment(householdId)
  const remove = useDeleteInstallment(householdId)

  const [name, setName] = useState(installment?.name ?? prefill?.name ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(installment?.category_id ?? prefill?.categoryId ?? null)
  const [startDate, setStartDate] = useState(installment?.start_date ?? prefill?.date ?? today())
  const [totalPeriods, setTotalPeriods] = useState(String(installment?.total_periods ?? 12))
  const monthlyAmount = useAmountEntry(installment ? String(installment.monthly_amount) : prefill ? String(prefill.amount) : '')
  const finalAmount = useAmountEntry(installment?.final_amount != null ? String(installment.final_amount) : '')
  // Which of the two amount fields the sticky-footer Keypad is bound to
  // (DESIGN.md §7.2 D9) — only one keypad, shared between them.
  const [activeAmount, setActiveAmount] = useState<'monthly' | 'final' | null>(null)
  const [instrument, setInstrument] = useState<Instrument>({
    accountId: installment?.account_id ?? prefill?.from.accountId ?? null,
    cardId: installment?.card_id ?? prefill?.from.cardId ?? null,
  })
  const [interestRate, setInterestRate] = useState(String(installment?.annual_interest_rate ?? '0'))
  const [isCashAdvance, setIsCashAdvance] = useState(installment?.is_cash_advance ?? false)
  const [ownerId, setOwnerId] = useState<string | null>(installment?.owner_id ?? prefill?.ownerId ?? null)
  const [note, setNote] = useState(installment?.note ?? '')

  const flatExpenseCategories = (categories ?? []).filter((c) => !c.archived && c.kind === 'expense')
  // Mains followed immediately by their own subs (D10) — a flat dropdown
  // still needs to read as a hierarchy, not a shuffled list.
  const expenseCategories = flatExpenseCategories
    .filter((c) => c.parent_id === null)
    .flatMap((main) => [main, ...flatExpenseCategories.filter((c) => c.parent_id === main.id)])

  // Category is required, not a nicety: every period posts as an expense, and
  // transactions' category_iff_not_transfer check rejects an expense with no
  // category — so a plan saved without one silently never posts.
  const canSave =
    name.trim().length > 0 &&
    Number(totalPeriods) > 0 &&
    monthlyAmount.value > 0 &&
    categoryId != null &&
    Boolean(instrument.accountId || instrument.cardId)

  async function handleSave() {
    const input: InstallmentInput = {
      name: name.trim(),
      category_id: categoryId,
      start_date: startDate,
      total_periods: Number(totalPeriods),
      monthly_amount: monthlyAmount.value,
      final_amount: finalAmount.expr ? finalAmount.value : null,
      card_id: instrument.cardId,
      account_id: instrument.accountId,
      annual_interest_rate: Number(interestRate),
      is_cash_advance: isCashAdvance,
      owner_id: ownerId,
      note: note || null,
      status: installment?.status ?? 'active',
    }
    if (installment) {
      await update.mutateAsync({ id: installment.id, input })
    } else {
      await create.mutateAsync(input)
    }
    onClose()
  }

  async function handleDelete() {
    if (!installment) return
    await remove.mutateAsync(installment.id)
    onClose()
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{installment ? 'Edit installment' : 'New installment'}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="inst-name">Name</Label>
            {/* No autoFocus: opening the system keyboard the instant the sheet
                mounts is what shoved the whole sheet off-screen on iOS
                (DESIGN §7.2 D9 — same bug the amount keypad exists to avoid).
                Tapping the field remains a deliberate, expected keyboard open. */}
            <Input id="inst-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId ?? ''} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.parent_id ? `↳ ${c.name}` : c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inst-start">Start date</Label>
              <DateField id="inst-start" value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-periods">Total periods</Label>
              <Input id="inst-periods" type="number" min={1} value={totalPeriods} onChange={(e) => setTotalPeriods(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AmountField
              label="Amount per period"
              expr={monthlyAmount.expr}
              active={activeAmount === 'monthly'}
              onActivate={() => setActiveAmount('monthly')}
            />
            <AmountField
              label="Final period (optional)"
              expr={finalAmount.expr}
              active={activeAmount === 'final'}
              onActivate={() => setActiveAmount('final')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Billed to</Label>
            <InstrumentSelect value={instrument} onChange={setInstrument} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inst-rate">Annual interest rate (%)</Label>
              <Input id="inst-rate" type="number" inputMode="decimal" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <OwnerSelect value={ownerId} onChange={setOwnerId} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <Label htmlFor="inst-cash-advance">Cash advance</Label>
              <p className="text-xs text-muted-foreground">Floats to the top of the payoff ranking</p>
            </div>
            <Switch id="inst-cash-advance" checked={isCashAdvance} onCheckedChange={setIsCashAdvance} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inst-note">Note (optional)</Label>
            <Input id="inst-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DrawerFooter>
          {activeAmount ? (
            <Keypad
              onKey={activeAmount === 'monthly' ? monthlyAmount.press : finalAmount.press}
              onEquals={activeAmount === 'monthly' ? monthlyAmount.pressEquals : finalAmount.pressEquals}
              onDone={() => setActiveAmount(null)}
            />
          ) : (
            <div className="flex gap-2">
              {installment && (
                <Button variant="outline" size="icon" onClick={handleDelete} aria-label="Delete installment">
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
