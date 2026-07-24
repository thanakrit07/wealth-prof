import { useState } from 'react'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InstrumentSelect, type Instrument } from '@/components/InstrumentSelect'
import { OwnerSelect } from '@/components/OwnerSelect'
import { CategoryIcon } from '@/lib/categoryIcons'
import { useCategories } from '@/lib/categories'
import { useHousehold } from '@/lib/HouseholdContext'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
  type Transaction,
  type TransactionInput,
  type TransactionKind,
} from '@/lib/transactions'
import { cn } from '@/lib/utils'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction
}

export function TransactionSheet({ open, onOpenChange, transaction }: Props) {
  const { householdId, self } = useHousehold()
  const { data: categories } = useCategories(householdId)
  const create = useCreateTransaction(householdId)
  const update = useUpdateTransaction(householdId)
  const remove = useDeleteTransaction(householdId)

  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? 'expense')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id ?? null)
  const [from, setFrom] = useState<Instrument>({
    accountId: transaction?.from_account_id ?? null,
    cardId: transaction?.from_card_id ?? null,
  })
  const [to, setTo] = useState<Instrument>({
    accountId: transaction?.to_account_id ?? null,
    cardId: transaction?.to_card_id ?? null,
  })
  const [ownerId, setOwnerId] = useState<string | null>(transaction?.owner_id ?? self.id)
  const [date, setDate] = useState(transaction?.date ?? today())
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')

  const relevantCategories = (categories ?? []).filter((c) => !c.archived && c.kind === kind)

  const canSave =
    Number(amount) > 0 &&
    (kind === 'transfer' ? Boolean(to.accountId || to.cardId) : Boolean(categoryId)) &&
    Boolean(from.accountId || from.cardId)

  function resetForNextEntry() {
    setAmount('')
    setDescription('')
    setNote('')
    setCategoryId(null)
  }

  async function handleSave() {
    const input: TransactionInput = {
      date,
      kind,
      categoryId: kind === 'transfer' ? null : categoryId,
      categoryKind: kind === 'transfer' ? null : (kind as 'income' | 'expense'),
      description,
      amount: Number(amount),
      ownerId,
      fromAccountId: from.accountId,
      fromCardId: from.cardId,
      toAccountId: kind === 'transfer' ? to.accountId : null,
      toCardId: kind === 'transfer' ? to.cardId : null,
      note: note || null,
    }
    if (transaction) {
      await update.mutateAsync({ id: transaction.id, input })
      onOpenChange(false)
    } else {
      await create.mutateAsync(input)
      resetForNextEntry()
      onOpenChange(false)
    }
  }

  async function handleDelete() {
    if (!transaction) return
    await remove.mutateAsync(transaction.id)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{transaction ? 'Edit transaction' : 'Add transaction'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          <Input
            type="number"
            inputMode="decimal"
            autoFocus
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-14 text-center text-3xl font-semibold"
          />

          <Tabs value={kind} onValueChange={(v) => setKind(v as TransactionKind)}>
            <TabsList className="w-full">
              <TabsTrigger value="expense" className="flex-1">
                Expense
              </TabsTrigger>
              <TabsTrigger value="income" className="flex-1">
                Income
              </TabsTrigger>
              <TabsTrigger value="transfer" className="flex-1">
                Transfer
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {kind !== 'transfer' ? (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="grid grid-cols-4 gap-2">
                {relevantCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs',
                      categoryId === c.id ? 'border-primary bg-primary/10' : 'border-border',
                    )}
                  >
                    <CategoryIcon icon={c.icon} className="size-5" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ArrowRightLeft className="size-4" />
              Between your own accounts/cards
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <OwnerSelect value={ownerId} onChange={setOwnerId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="txn-date">Date</Label>
              <Input id="txn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txn-description">Description (optional)</Label>
            <Input id="txn-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txn-note">Note (optional)</Label>
            <Input id="txn-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex gap-2">
            {transaction && (
              <Button variant="outline" size="icon" onClick={handleDelete} aria-label="Delete transaction">
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button className="flex-1" onClick={handleSave} disabled={!canSave || create.isPending || update.isPending}>
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
