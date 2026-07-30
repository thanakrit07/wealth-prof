import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, MoreHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AmountField } from '@/components/AmountField'
import { InstrumentSelect, type Instrument } from '@/components/InstrumentSelect'
import { Keypad } from '@/components/Keypad'
import { OwnerSelect } from '@/components/OwnerSelect'
import { useAmountEntry } from '@/hooks/useAmountEntry'
import { CategoryIcon } from '@/lib/categoryIcons'
import { useCategories, type Category } from '@/lib/categories'
import { useCategoryUsage } from '@/lib/categoryUsage'
import { useHousehold } from '@/lib/HouseholdContext'
import { supabase } from '@/lib/supabase'
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

// Top-N tiles shown before the "More" tile (7 + More = 2 rows of 4).
const COLLAPSED_TILES = 7

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction
}

export function TransactionSheet({ open, onOpenChange, transaction }: Props) {
  const { householdId, self, members } = useHousehold()
  const { data: categories } = useCategories(householdId)
  const { data: usage } = useCategoryUsage(householdId)
  const queryClient = useQueryClient()
  const create = useCreateTransaction(householdId)
  const update = useUpdateTransaction(householdId)
  const remove = useDeleteTransaction(householdId)

  const [kind, setKind] = useState<TransactionKind>(transaction?.kind ?? 'expense')
  const amountField = useAmountEntry(transaction ? String(transaction.amount) : '')
  const [keypadOpen, setKeypadOpen] = useState(false)
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

  // Progressive disclosure (DESIGN.md §7.2): the grid starts at 2 rows,
  // owner/date collapse into a one-line summary, and description/note are
  // hidden unless already filled in (when editing) or explicitly opened.
  const [gridExpanded, setGridExpanded] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(Boolean(transaction?.description || transaction?.note))
  // Once the user picks an instrument by hand (or is editing an existing
  // row), category taps must stop auto-overriding it.
  const [fromTouched, setFromTouched] = useState(Boolean(transaction))

  const relevantCategories = (categories ?? [])
    .filter((c) => !c.archived && c.kind === kind)
    .sort((a, b) => {
      const byUsage = (usage?.counts.get(b.id) ?? 0) - (usage?.counts.get(a.id) ?? 0)
      return byUsage !== 0 ? byUsage : a.sort_order - b.sort_order
    })

  // With 8 or fewer categories everything fits in 2 rows anyway, so the
  // More tile would only add a row. The selected category must always be
  // visible, so a hidden selection (e.g. while editing) forces expansion.
  const needsMoreTile = relevantCategories.length > COLLAPSED_TILES + 1
  const selectionHidden =
    categoryId != null && relevantCategories.slice(COLLAPSED_TILES).some((c) => c.id === categoryId)
  const showAll = gridExpanded || !needsMoreTile || selectionHidden
  const visibleCategories = showAll ? relevantCategories : relevantCategories.slice(0, COLLAPSED_TILES)

  const ownerLabel = ownerId ? (members.find((m) => m.id === ownerId)?.display_name ?? 'Shared') : 'Shared'
  const dateLabel = date === today() ? 'Today' : date

  const canSave =
    amountField.value > 0 &&
    (kind === 'transfer' ? Boolean(to.accountId || to.cardId) : Boolean(categoryId)) &&
    Boolean(from.accountId || from.cardId)

  function changeKind(next: TransactionKind) {
    setKind(next)
    setGridExpanded(false)
    // A category from the other kind would violate the DB's composite FK.
    const current = categories?.find((c) => c.id === categoryId)
    if (current && current.kind !== next) setCategoryId(null)
  }

  function selectCategory(category: Category) {
    setCategoryId(category.id)
    // Smart default: the instrument last used with this category.
    if (!fromTouched) {
      const last = usage?.lastInstrument.get(category.id)
      if (last && (last.accountId || last.cardId)) setFrom(last)
    }
  }

  function resetForNextEntry() {
    amountField.reset()
    setKeypadOpen(false)
    setDescription('')
    setNote('')
    setCategoryId(null)
    setGridExpanded(false)
    setMetaOpen(false)
    setDetailsOpen(false)
  }

  async function handleSave() {
    const input: TransactionInput = {
      date,
      kind,
      categoryId: kind === 'transfer' ? null : categoryId,
      categoryKind: kind === 'transfer' ? null : (kind as 'income' | 'expense'),
      description,
      amount: amountField.value,
      ownerId,
      fromAccountId: from.accountId,
      fromCardId: from.cardId,
      toAccountId: kind === 'transfer' ? to.accountId : null,
      toCardId: kind === 'transfer' ? to.cardId : null,
      note: note || null,
    }
    if (transaction) {
      // Saving an unconfirmed (generated) row counts as reviewing it.
      await update.mutateAsync({ id: transaction.id, input, confirm: !transaction.confirmed })
      onOpenChange(false)
      return
    }
    const id = await create.mutateAsync(input)
    resetForNextEntry()
    onOpenChange(false)
    toast.success('Transaction saved', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
          queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
        },
      },
    })
  }

  async function handleDelete() {
    if (!transaction) return
    await remove.mutateAsync(transaction.id)
    onOpenChange(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{transaction ? 'Edit transaction' : 'Add transaction'}</DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4 px-4 pb-4">
          <AmountField size="lg" expr={amountField.expr} active={keypadOpen} onActivate={() => setKeypadOpen(true)} />

          <Tabs value={kind} onValueChange={(v) => changeKind(v as TransactionKind)}>
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
            <div className="grid grid-cols-4 gap-2">
              {visibleCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCategory(c)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs',
                    categoryId === c.id ? 'border-primary bg-primary/10' : 'border-border',
                  )}
                >
                  <CategoryIcon icon={c.icon} className="size-5" />
                  <span className="w-full truncate text-center">{c.name}</span>
                </button>
              ))}
              {!showAll && (
                <button
                  onClick={() => setGridExpanded(true)}
                  className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground"
                >
                  <MoreHorizontal className="size-5" />
                  <span>More</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ArrowRightLeft className="size-4" />
              Between your own accounts/cards
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{kind === 'transfer' ? 'From' : 'Account / card'}</Label>
            <InstrumentSelect
              value={from}
              onChange={(next) => {
                setFrom(next)
                setFromTouched(true)
              }}
            />
          </div>

          {kind === 'transfer' && (
            <div className="space-y-1.5">
              <Label>To</Label>
              <InstrumentSelect value={to} onChange={setTo} />
            </div>
          )}

          {!metaOpen ? (
            <button
              type="button"
              onClick={() => setMetaOpen(true)}
              className="flex w-full items-center justify-between text-sm text-muted-foreground"
            >
              <span>
                {ownerLabel} · {dateLabel}
              </span>
              <span className="underline underline-offset-2">Edit</span>
            </button>
          ) : (
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
          )}

          {!detailsOpen ? (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              + Add details
            </button>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="txn-description">Description (optional)</Label>
                <Input id="txn-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="txn-note">Note (optional)</Label>
                <Input id="txn-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DrawerFooter>
          {keypadOpen ? (
            <Keypad onKey={amountField.press} onEquals={amountField.pressEquals} onDone={() => setKeypadOpen(false)} />
          ) : (
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
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
