import { Fragment, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, ChevronDown, MoreHorizontal, Trash2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { useAmountEntry } from '@/hooks/useAmountEntry'
import { useAccounts } from '@/lib/accounts'
import { useCards } from '@/lib/cards'
import { CategoryIcon } from '@/lib/categoryIcons'
import { useCategories, type Category } from '@/lib/categories'
import { useCategoryUsage } from '@/lib/categoryUsage'
import { formatBaht } from '@/lib/format'
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
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)
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
  // `?? self.id` would be wrong: null is a real owner value meaning "shared"
  // (§4.2), so a nullish fallback silently reassigns every shared transaction
  // to whoever opened it for editing — and saving that drops its split.
  const [ownerId, setOwnerId] = useState<string | null>(transaction ? transaction.owner_id : self.id)
  const [date, setDate] = useState(transaction?.date ?? today())
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [debtExempt, setDebtExempt] = useState(transaction?.debt_exempt ?? false)

  // Progressive disclosure (DESIGN.md §7.2): the grid starts at 2 rows,
  // owner/date collapse into a one-line summary, and description (the
  // secondary "+ Add details" field) is hidden unless already filled in
  // (when editing) or explicitly opened. Note is the primary ledger label
  // (0020) and stays always visible — see the input further down.
  const [gridExpanded, setGridExpanded] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(Boolean(transaction?.description))
  // Once the user picks an instrument by hand (or is editing an existing
  // row), category taps must stop auto-overriding it.
  const [fromTouched, setFromTouched] = useState(Boolean(transaction))
  // D10: which main category's subs are showing (Money Manager's chevron
  // pattern — a main with subs expands them in place instead of selecting
  // immediately). Auto-opens when editing a transaction filed under a sub.
  const [expandedMainId, setExpandedMainId] = useState<string | null>(null)

  useEffect(() => {
    if (!transaction?.category_id || !categories) return
    const current = categories.find((c) => c.id === transaction.category_id)
    if (current?.parent_id) setExpandedMainId(current.parent_id)
  }, [categories, transaction?.category_id])

  // Ordered by the arrangement set in Manage categories, not by usage
  // frequency: the drag order is an explicit choice, and letting counts
  // reshuffle the grid moves tiles out from under the user's muscle memory.
  const bySortOrder = (a: Category, b: Category) => a.sort_order - b.sort_order
  const relevantCategories = (categories ?? []).filter((c) => !c.archived && c.kind === kind)
  const mainCategories = relevantCategories.filter((c) => c.parent_id === null).sort(bySortOrder)
  const subsOf = (parentId: string) => relevantCategories.filter((c) => c.parent_id === parentId).sort(bySortOrder)

  // With 8 or fewer categories everything fits in 2 rows anyway, so the
  // More tile would only add a row. The selected category's main must
  // always be visible, so a hidden selection (e.g. while editing) forces
  // expansion.
  const needsMoreTile = mainCategories.length > COLLAPSED_TILES + 1
  const selectedCategory = categoryId ? relevantCategories.find((c) => c.id === categoryId) : null
  const selectedMainId = selectedCategory ? (selectedCategory.parent_id ?? selectedCategory.id) : null
  const selectionHidden =
    selectedMainId != null && mainCategories.slice(COLLAPSED_TILES).some((c) => c.id === selectedMainId)
  const showAll = gridExpanded || !needsMoreTile || selectionHidden
  const visibleCategories = showAll ? mainCategories : mainCategories.slice(0, COLLAPSED_TILES)
  const expandedSubs = expandedMainId ? subsOf(expandedMainId) : []

  // One flat tile list so "More" takes part in row arithmetic like any other
  // tile — otherwise the sub tray lands under the wrong line whenever the
  // grid is collapsed.
  type Tile = { kind: 'main'; category: Category } | { kind: 'more' }
  const tiles: Tile[] = [
    ...visibleCategories.map((category): Tile => ({ kind: 'main', category })),
    ...(showAll ? [] : ([{ kind: 'more' }] as Tile[])),
  ]

  // D10: the sub tray goes right after the last tile of the row holding the
  // tapped main, not after the whole grid, so it reads as belonging to that
  // row instead of appearing a full row away.
  const expandedTileIndex = tiles.findIndex((t) => t.kind === 'main' && t.category.id === expandedMainId)
  const subRowAfter =
    expandedSubs.length === 0
      ? -1
      : expandedTileIndex < 0
        ? tiles.length - 1
        : Math.min(Math.floor(expandedTileIndex / 4) * 4 + 3, tiles.length - 1)

  const ownerLabel = ownerId ? (members.find((m) => m.id === ownerId)?.display_name ?? 'Shared') : 'Shared'
  const dateLabel = date === today() ? 'Today' : date

  // The database (0022) writes transaction_shares itself, for every save —
  // create, edit, import, recurring, installment — so the form never has to.
  // What it does need to do is tell the person what's about to happen: two
  // ways a transaction can turn into a debt (0023's debt_kind), from
  // whichever instrument is currently selected.
  const frontingMemberId =
    (from.accountId ? accounts?.find((a) => a.id === from.accountId)?.owner_id : null) ??
    (from.cardId ? cards?.find((c) => c.id === from.cardId)?.owner_id : null) ??
    null
  const isSplit = kind !== 'transfer' && ownerId === null && members.length > 1
  const isBorrow =
    kind !== 'transfer' && ownerId !== null && frontingMemberId !== null && frontingMemberId !== ownerId
  const debtPreview = isSplit
    ? amountField.value > 0
      ? `Split evenly · ${formatBaht(amountField.value / members.length)} each (${members.length})`
      : null
    : isBorrow
      ? `On ${members.find((m) => m.id === frontingMemberId)?.display_name ?? 'their'}'s card/account — counts as owing ${formatBaht(amountField.value)}`
      : null

  const canSave =
    amountField.value > 0 &&
    (kind === 'transfer' ? Boolean(to.accountId || to.cardId) : Boolean(categoryId)) &&
    Boolean(from.accountId || from.cardId)

  function changeKind(next: TransactionKind) {
    setKind(next)
    setGridExpanded(false)
    setExpandedMainId(null)
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
    setExpandedMainId(null)
    setMetaOpen(false)
    setDetailsOpen(false)
    setDebtExempt(false)
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
      debtExempt,
    }
    try {
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
    } catch (err) {
      // Some edits are refused outright — changing the amount of a shared
      // transaction whose split is already settled, for one (0022). Those
      // messages say what to do about it, so show them instead of failing
      // silently, which is what an unhandled rejection here used to do.
      toast.error(err instanceof Error ? err.message : 'Could not save the transaction.')
    }
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

        <div className="space-y-3 px-4 pb-4">
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
            <div className="grid grid-cols-4 gap-1.5">
              {tiles.map((tile, i) => {
                const c = tile.kind === 'main' ? tile.category : null
                const hasSubs = c ? subsOf(c.id).length > 0 : false
                const isExpandedMain = c != null && expandedMainId === c.id
                const showTrayAfter = i === subRowAfter
                return (
                  <Fragment key={c ? c.id : '__more__'}>
                    {c ? (
                      <button
                        // Selecting the main is always enough to save; the
                        // subs just open alongside as an optional refinement,
                        // so a main with children is never a dead end.
                        onClick={() => {
                          selectCategory(c)
                          setExpandedMainId(hasSubs && !isExpandedMain ? c.id : null)
                        }}
                        className={cn(
                          'relative flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] leading-tight',
                          categoryId === c.id
                            ? 'border-primary bg-primary/10'
                            : isExpandedMain
                              ? 'border-primary/40'
                              : 'border-border',
                          isExpandedMain && showTrayAfter && 'rounded-b-none border-b-transparent',
                        )}
                      >
                        <CategoryIcon icon={c.icon} color={c.color} className="size-4.5" />
                        <span className="w-full truncate text-center">{c.name}</span>
                        {hasSubs && (
                          <ChevronDown
                            className={cn(
                              'absolute top-0.5 right-0.5 size-3 text-muted-foreground transition-transform',
                              isExpandedMain && 'rotate-180',
                            )}
                          />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setGridExpanded(true)}
                        className="flex flex-col items-center gap-0.5 rounded-lg border border-dashed border-border px-1 py-1.5 text-[11px] leading-tight text-muted-foreground"
                      >
                        <MoreHorizontal className="size-4.5" />
                        <span>More</span>
                      </button>
                    )}

                    {showTrayAfter && (
                      // -mt-1.5 cancels the grid gap so the tray butts against
                      // the row above; the matching accent border keeps it
                      // reading as attached to the tapped main rather than a
                      // new row of peers (D10 — sub categories shown close to
                      // their parent).
                      <div className="col-span-4 -mt-1.5 grid grid-cols-4 gap-1.5 rounded-lg rounded-t-none border border-t-0 border-primary/40 bg-muted/50 p-1.5">
                        {expandedSubs.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => selectCategory(sub)}
                            className={cn(
                              'flex flex-col items-center gap-0.5 rounded-lg border bg-background px-1 py-1.5 text-[11px] leading-tight',
                              categoryId === sub.id ? 'border-primary bg-primary/10' : 'border-border',
                            )}
                          >
                            <CategoryIcon icon={sub.icon} color={sub.color} className="size-4" />
                            <span className="w-full truncate text-center">{sub.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Fragment>
                )
              })}
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
                {debtPreview && <p className="text-xs text-muted-foreground">{debtPreview}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="txn-date">Date</Label>
                <Input id="txn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          )}

          {(isSplit || isBorrow) && (
            <label className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
              <span>
                Not a debt
                <span className="block text-xs text-muted-foreground">
                  Won't show up as owed on Overview, even though it isn't on your own card/account.
                </span>
              </span>
              <Switch checked={debtExempt} onCheckedChange={setDebtExempt} />
            </label>
          )}

          {/* Always open, but no longer required to be the last field: both
              this and Details sit at the very bottom of the form, so neither
              one's keyboard ever has something below it to shove (D9,
              §7.2) — only their order relative to each other changes here. */}
          <div className="space-y-1.5">
            <Label htmlFor="txn-note">Note</Label>
            <Input id="txn-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {!detailsOpen ? (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              + Add details
            </button>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="txn-description">Details (optional)</Label>
              <Input id="txn-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
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
