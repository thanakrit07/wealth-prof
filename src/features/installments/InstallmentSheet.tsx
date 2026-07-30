import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Switch } from '@/components/ui/switch'
import { InstrumentSelect, type Instrument } from '@/components/InstrumentSelect'
import { OwnerSelect } from '@/components/OwnerSelect'
import { useCategories } from '@/lib/categories'
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
}

export function InstallmentSheet({ installment, onClose }: Props) {
  const { householdId } = useHousehold()
  const { data: categories } = useCategories(householdId)
  const create = useCreateInstallment(householdId)
  const update = useUpdateInstallment(householdId)
  const remove = useDeleteInstallment(householdId)

  const [name, setName] = useState(installment?.name ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(installment?.category_id ?? null)
  const [startDate, setStartDate] = useState(installment?.start_date ?? today())
  const [totalPeriods, setTotalPeriods] = useState(String(installment?.total_periods ?? 12))
  const [monthlyAmount, setMonthlyAmount] = useState(installment ? String(installment.monthly_amount) : '')
  const [finalAmount, setFinalAmount] = useState(installment?.final_amount != null ? String(installment.final_amount) : '')
  const [instrument, setInstrument] = useState<Instrument>({
    accountId: installment?.account_id ?? null,
    cardId: installment?.card_id ?? null,
  })
  const [interestRate, setInterestRate] = useState(String(installment?.annual_interest_rate ?? '0'))
  const [isCashAdvance, setIsCashAdvance] = useState(installment?.is_cash_advance ?? false)
  const [ownerId, setOwnerId] = useState<string | null>(installment?.owner_id ?? null)
  const [note, setNote] = useState(installment?.note ?? '')

  const expenseCategories = (categories ?? []).filter((c) => !c.archived && c.kind === 'expense')

  const canSave =
    name.trim().length > 0 &&
    Number(totalPeriods) > 0 &&
    Number(monthlyAmount) > 0 &&
    Boolean(instrument.accountId || instrument.cardId)

  async function handleSave() {
    const input: InstallmentInput = {
      name: name.trim(),
      category_id: categoryId,
      start_date: startDate,
      total_periods: Number(totalPeriods),
      monthly_amount: Number(monthlyAmount),
      final_amount: finalAmount ? Number(finalAmount) : null,
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
            <Input id="inst-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Category (optional)</Label>
            <Select value={categoryId ?? ''} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inst-start">Start date</Label>
              <Input id="inst-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-periods">Total periods</Label>
              <Input id="inst-periods" type="number" min={1} value={totalPeriods} onChange={(e) => setTotalPeriods(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inst-amount">Amount per period</Label>
              <Input id="inst-amount" type="number" inputMode="decimal" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-final">Final period (optional)</Label>
              <Input id="inst-final" type="number" inputMode="decimal" value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} />
            </div>
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
        </div>
      </DrawerContent>
    </Drawer>
  )
}
