import { useMemo, useState } from 'react'
import { ChevronDown, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { DateField } from '@/components/DateField'
import { SwipeableRow } from '@/components/SwipeableRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { OwnerSelect } from '@/components/OwnerSelect'
import { useAccounts, useCreateAccount, useUpdateAccount, type Account, type AccountType } from '@/lib/accounts'
import { useCards, useCreateCard, useUpdateCard, type Card } from '@/lib/cards'
import { accountBalance, cardOutstanding, memberNetWorth } from '@/lib/finance/balances'
import type { PersonFilter } from '@/lib/filters'
import { useHousehold } from '@/lib/HouseholdContext'
import {
  isInstrumentBlocked,
  useDeleteInstrument,
  useInstrumentUsage,
  type InstrumentKind,
} from '@/lib/instruments'
import { formatBaht } from '@/lib/format'
import { dayMonthLabel } from '@/lib/month'
import { useTransactions } from '@/lib/transactions'
import { useSettlements, useUndoRepayment, useUnsettledShares } from '@/lib/transactionShares'
import { cn } from '@/lib/utils'
import { SettleUpSheet } from '@/features/home/SettleUpSheet'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Wide enough to hold every real row (anchor dates in the past) and every
// installment period already posted ahead (ADR-0001 — years, not months).
// Net worth needs the whole ledger, not a windowed slice like every other
// screen's month/cycle range.
const ALL_TIME = { start: '2000-01-01', end: '2100-01-01' }

// D-0004: debts and their repayment history live here, not on Records —
// what one person owes another is a current-state figure like an account
// balance, not something that happened in a particular month.
function BetweenUsSection() {
  const { householdId, members } = useHousehold()
  const { data: unsettled } = useUnsettledShares(householdId)
  const { data: settlements } = useSettlements(householdId)
  const undoRepayment = useUndoRepayment(householdId)
  const [settling, setSettling] = useState<{ memberA: string; memberB: string } | null>(null)

  const settlementRows = useMemo(() => {
    const pairs = new Map<
      string,
      { memberA: string; memberB: string; owedByA: number; owedByB: number; count: number }
    >()
    for (const share of unsettled ?? []) {
      const [memberA, memberB] = [share.owes_member_id, share.owed_member_id].sort()
      const key = `${memberA}|${memberB}`
      const entry = pairs.get(key) ?? { memberA, memberB, owedByA: 0, owedByB: 0, count: 0 }
      if (share.owes_member_id === memberA) entry.owedByA += share.amount
      else entry.owedByB += share.amount
      entry.count += 1
      pairs.set(key, entry)
    }
    return [...pairs.values()].map((entry) => {
      const net = entry.owedByA - entry.owedByB
      return {
        ...entry,
        owesId: net >= 0 ? entry.memberA : entry.memberB,
        owedId: net >= 0 ? entry.memberB : entry.memberA,
        amount: Math.abs(net),
      }
    })
  }, [unsettled])
  const nameOf = (memberId: string) => members.find((m) => m.id === memberId)?.display_name ?? 'Someone'
  const recentSettlements = (settlements ?? []).slice(0, 5)

  if (settlementRows.length === 0 && recentSettlements.length === 0) return null

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Between us</h2>
        {settlementRows.length > 0 && (
          <div className="space-y-2">
            {settlementRows.map((row) => (
              <div
                key={`${row.memberA}-${row.memberB}`}
                className="flex items-center justify-between gap-3 rounded-2xl border bg-warning px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  {row.amount > 0 ? (
                    <span className="block">
                      <span className="font-medium">{nameOf(row.owesId)}</span> owes{' '}
                      <span className="font-medium">{nameOf(row.owedId)}</span>{' '}
                      <span className="font-semibold text-warning-foreground">{formatBaht(row.amount)}</span>
                    </span>
                  ) : (
                    <span className="block font-medium">
                      {nameOf(row.memberA)} and {nameOf(row.memberB)} are even
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {row.count} item{row.count === 1 ? '' : 's'}
                    {row.owedByA > 0 && row.owedByB > 0
                      ? ` · net of ${nameOf(row.memberA)} ${formatBaht(row.owedByA)} / ${nameOf(row.memberB)} ${formatBaht(row.owedByB)}`
                      : ''}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setSettling({ memberA: row.memberA, memberB: row.memberB })}
                >
                  Settle up
                </Button>
              </div>
            ))}
          </div>
        )}

        {recentSettlements.length > 0 && (
          <div className="divide-y rounded-2xl border bg-card">
            {recentSettlements.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {nameOf(s.from_member_id)} → {nameOf(s.to_member_id)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {dayMonthLabel(s.settled_on)} · {s.share_count} item{s.share_count === 1 ? '' : 's'}
                    {s.gross_amount !== s.amount ? ` · cleared ${formatBaht(s.gross_amount)}` : ''}
                    {s.net_cleared !== s.amount ? ` · doesn't match linked debts (${formatBaht(s.net_cleared)})` : ''}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatBaht(s.amount)}</span>
                <button
                  type="button"
                  onClick={() => undoRepayment.mutate(s.id)}
                  disabled={undoRepayment.isPending}
                  className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
                >
                  Undo
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {settling && (
        <SettleUpSheet
          open
          onOpenChange={(open) => !open && setSettling(null)}
          memberA={settling.memberA}
          memberB={settling.memberB}
        />
      )}
    </>
  )
}

interface Props {
  person: PersonFilter
  onOpenAccount: (accountId: string) => void
  onOpenCard: (cardId: string) => void
}

export function AccountsScreen({ person, onOpenAccount, onOpenCard }: Props) {
  const { householdId, members } = useHousehold()
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)
  const { data: transactions } = useTransactions(householdId, ALL_TIME)
  const { data: debts } = useUnsettledShares(householdId)
  const [editingAccount, setEditingAccount] = useState<Account | 'new' | null>(null)
  const [editingCard, setEditingCard] = useState<Card | 'new' | null>(null)
  const [deleting, setDeleting] = useState<{ kind: InstrumentKind; id: string; name: string } | null>(null)
  const [netWorthOpen, setNetWorthOpen] = useState(false)

  const today = todayIso()
  const allAccounts = accounts ?? []
  const allCards = cards ?? []
  const allTxns = transactions ?? []
  const allDebts = debts ?? []

  // D18: a Common Pot has no owner and no per-person breakdown, so it sits
  // outside every filter below — every person filter sees it, and it is
  // never one of "mine" or "theirs".
  const potAccounts = allAccounts.filter((a) => a.owner_id === null)
  const potCards = allCards.filter((c) => c.owner_id === null)
  const potBalance =
    potAccounts.reduce((sum, a) => sum + accountBalance(a, allTxns, today), 0) -
    potCards.reduce((sum, c) => sum + cardOutstanding(c, allTxns), 0)

  // D19: Balances honours the person filter like every other screen — "You"
  // shows only what's yours, so the app still works as a single-person
  // ledger for someone who never opens the Between-us section.
  const visibleAccounts = person === 'all' ? allAccounts : allAccounts.filter((a) => a.owner_id === person)
  const visibleCards = person === 'all' ? allCards : allCards.filter((c) => c.owner_id === person)

  const netWorthRows = members.map((m) => ({
    member: m,
    amount: memberNetWorth(m.id, allAccounts, allCards, allTxns, allDebts, today),
  }))
  const householdNetWorth = netWorthRows.reduce((sum, r) => sum + r.amount, 0)
  const headlineNetWorth = person === 'all' ? householdNetWorth : (netWorthRows.find((r) => r.member.id === person)?.amount ?? 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <button
        type="button"
        onClick={() => setNetWorthOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-2xl border bg-linear-to-br from-secondary/50 via-card to-accent/40 px-4 py-2.5 text-left text-sm shadow-sm"
      >
        <span className="flex-1 text-muted-foreground">Net worth</span>
        <span className={cn('font-semibold', headlineNetWorth >= 0 ? 'text-good' : 'text-destructive')}>
          {formatBaht(headlineNetWorth)}
        </span>
        {person === 'all' && (
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', netWorthOpen && 'rotate-180')} />
        )}
      </button>

      {person === 'all' && netWorthOpen && netWorthRows.length > 0 && (
        <div className="divide-y rounded-2xl border bg-card">
          {netWorthRows.map((row) => (
            <div key={row.member.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.member.color }} />
              <span className="flex-1 truncate">{row.member.display_name}</span>
              <span className={row.amount >= 0 ? 'text-good' : 'text-destructive'}>{formatBaht(row.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(potAccounts.length > 0 || potCards.length > 0) && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Common pot</h2>
            <span className="text-sm font-medium">{formatBaht(potBalance)}</span>
          </div>
          <ul className="space-y-1">
            {potAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                balance={accountBalance(account, allTxns, today)}
                onOpen={() => onOpenAccount(account.id)}
                onEdit={() => setEditingAccount(account)}
                onDelete={() => setDeleting({ kind: 'account', id: account.id, name: account.name })}
              />
            ))}
            {potCards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                outstanding={cardOutstanding(card, allTxns)}
                onOpen={() => !card.archived && onOpenCard(card.id)}
                onEdit={() => setEditingCard(card)}
                onDelete={() => setDeleting({ kind: 'card', id: card.id, name: card.name })}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Accounts</h2>
          <Button size="sm" variant="outline" onClick={() => setEditingAccount('new')}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <ul className="space-y-1">
          {visibleAccounts
            .filter((a) => a.owner_id !== null)
            .map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                balance={accountBalance(account, allTxns, today)}
                onOpen={() => onOpenAccount(account.id)}
                onEdit={() => setEditingAccount(account)}
                onDelete={() => setDeleting({ kind: 'account', id: account.id, name: account.name })}
              />
            ))}
          {visibleAccounts.filter((a) => a.owner_id !== null).length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts yet.</p>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Credit cards</h2>
          <Button size="sm" variant="outline" onClick={() => setEditingCard('new')}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <ul className="space-y-1">
          {visibleCards
            .filter((c) => c.owner_id !== null)
            .map((card) => (
              <CardRow
                key={card.id}
                card={card}
                outstanding={cardOutstanding(card, allTxns)}
                onOpen={() => !card.archived && onOpenCard(card.id)}
                onEdit={() => setEditingCard(card)}
                onDelete={() => setDeleting({ kind: 'card', id: card.id, name: card.name })}
              />
            ))}
          {visibleCards.filter((c) => c.owner_id !== null).length === 0 && (
            <p className="text-sm text-muted-foreground">No cards yet.</p>
          )}
        </ul>
      </section>

      <BetweenUsSection />

      {editingAccount && (
        <AccountDialog
          key={editingAccount === 'new' ? 'new-account' : editingAccount.id}
          account={editingAccount === 'new' ? null : editingAccount}
          onClose={() => setEditingAccount(null)}
        />
      )}
      {editingCard && (
        <CardDialog
          key={editingCard === 'new' ? 'new-card' : editingCard.id}
          card={editingCard === 'new' ? null : editingCard}
          onClose={() => setEditingCard(null)}
        />
      )}
      {deleting && <DeleteInstrumentDialog target={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

function AccountRow({
  account,
  balance,
  onOpen,
  onEdit,
  onDelete,
}: {
  account: Account
  balance: number
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <li className="overflow-hidden rounded-lg border">
      <SwipeableRow onDelete={onDelete}>
        <div className="flex items-center gap-2 px-3 py-2 text-sm">
          <Badge variant="secondary" className="capitalize">
            {account.type}
          </Badge>
          <button
            onClick={onOpen}
            disabled={account.archived}
            className={account.archived ? 'flex-1 truncate text-left text-muted-foreground line-through' : 'flex-1 truncate text-left'}
          >
            {account.name}
          </button>
          <span className="text-muted-foreground">{formatBaht(balance)}</span>
          <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="Edit">
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </SwipeableRow>
    </li>
  )
}

function CardRow({
  card,
  outstanding,
  onOpen,
  onEdit,
  onDelete,
}: {
  card: Card
  outstanding: number
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const available = card.credit_limit - outstanding
  return (
    <li className="overflow-hidden rounded-lg border">
      <SwipeableRow onDelete={onDelete}>
        <div className="flex items-center gap-2 px-3 py-2 text-sm">
          <button
            onClick={onOpen}
            className={card.archived ? 'flex-1 truncate text-left text-muted-foreground line-through' : 'flex-1 truncate text-left'}
          >
            {card.name}
          </button>
          <span className="text-right text-muted-foreground">
            <span className="block">{formatBaht(outstanding)} owed</span>
            <span className="block text-xs">{formatBaht(available)} left</span>
          </span>
          <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="Edit">
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </SwipeableRow>
    </li>
  )
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { householdId } = useHousehold()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [ownerId, setOwnerId] = useState<string | null>(account?.owner_id ?? null)
  const [anchorBalance, setAnchorBalance] = useState(String(account?.anchor_balance ?? '0'))
  const [anchorDate, setAnchorDate] = useState(account?.anchor_date ?? new Date().toISOString().slice(0, 10))
  const [archived, setArchived] = useState(account?.archived ?? false)
  const create = useCreateAccount(householdId)
  const update = useUpdateAccount(householdId)

  async function handleSave() {
    const balance = Number(anchorBalance)
    if (account) {
      await update.mutateAsync({
        id: account.id,
        name,
        type,
        owner_id: ownerId,
        anchor_balance: balance,
        anchor_date: anchorDate,
        archived,
      })
    } else {
      await create.mutateAsync({ name, type, ownerId, anchorBalance: balance, anchorDate })
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Edit account' : 'New account'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Name</Label>
            <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="ewallet">E-wallet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <OwnerSelect value={ownerId} onChange={setOwnerId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="account-balance">Anchor balance</Label>
              <Input
                id="account-balance"
                type="number"
                inputMode="decimal"
                value={anchorBalance}
                onChange={(e) => setAnchorBalance(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-date">Anchor date</Label>
              <DateField id="account-date" value={anchorDate} onChange={setAnchorDate} />
            </div>
          </div>
          {account && (
            <div className="flex items-center justify-between">
              <Label htmlFor="account-archived">Archived</Label>
              <Switch id="account-archived" checked={archived} onCheckedChange={setArchived} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || create.isPending || update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CardDialog({ card, onClose }: { card: Card | null; onClose: () => void }) {
  const { householdId } = useHousehold()
  const [name, setName] = useState(card?.name ?? '')
  const [creditLimit, setCreditLimit] = useState(String(card?.credit_limit ?? '0'))
  const [statementDay, setStatementDay] = useState(String(card?.statement_day ?? '1'))
  const [dueDay, setDueDay] = useState(String(card?.due_day ?? '1'))
  const [interestRate, setInterestRate] = useState(String(card?.annual_interest_rate ?? '0'))
  const [ownerId, setOwnerId] = useState<string | null>(card?.owner_id ?? null)
  const [archived, setArchived] = useState(card?.archived ?? false)
  const create = useCreateCard(householdId)
  const update = useUpdateCard(householdId)

  async function handleSave() {
    const payload = {
      name,
      creditLimit: Number(creditLimit),
      statementDay: Number(statementDay),
      dueDay: Number(dueDay),
      annualInterestRate: Number(interestRate),
      ownerId,
    }
    if (card) {
      await update.mutateAsync({
        id: card.id,
        name: payload.name,
        credit_limit: payload.creditLimit,
        statement_day: payload.statementDay,
        due_day: payload.dueDay,
        annual_interest_rate: payload.annualInterestRate,
        owner_id: payload.ownerId,
        archived,
      })
    } else {
      await create.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card ? 'Edit card' : 'New card'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-name">Name</Label>
            <Input id="card-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-limit">Credit limit</Label>
            <Input id="card-limit" type="number" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-statement">Statement day</Label>
              <Input
                id="card-statement"
                type="number"
                min={1}
                max={31}
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-due">Due day</Label>
              <Input id="card-due" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-rate">Annual interest rate (%)</Label>
            <Input
              id="card-rate"
              type="number"
              inputMode="decimal"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <OwnerSelect value={ownerId} onChange={setOwnerId} />
          </div>
          {card && (
            <div className="flex items-center justify-between">
              <Label htmlFor="card-archived">Archived</Label>
              <Switch id="card-archived" checked={archived} onCheckedChange={setArchived} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || create.isPending || update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Deleting an account or card asks what should happen to its transactions,
 * because both answers are reasonable and destroy different things: a
 * mistyped account should take its rows with it, while a bank you've closed
 * has real history worth keeping. Kept rows still show the old name (see
 * useInstrumentNames), so "keep" doesn't quietly anonymise them.
 */
function DeleteInstrumentDialog({
  target,
  onClose,
}: {
  target: { kind: InstrumentKind; id: string; name: string }
  onClose: () => void
}) {
  const { householdId } = useHousehold()
  const { data: usage, isPending } = useInstrumentUsage(target.kind, target.id)
  const remove = useDeleteInstrument(householdId)
  const [withTransactions, setWithTransactions] = useState(false)

  const blocked = usage != null && isInstrumentBlocked(usage)
  const noun = target.kind === 'account' ? 'account' : 'card'

  async function handleDelete() {
    if (!usage) return
    await remove.mutateAsync({ kind: target.kind, id: target.id, withTransactions, usage })
    toast.success(
      withTransactions
        ? `Deleted "${target.name}" and ${usage.transactions} transaction${usage.transactions === 1 ? '' : 's'}`
        : `Deleted "${target.name}"`,
    )
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {noun} "{target.name}"?</DialogTitle>
        </DialogHeader>

        {isPending || !usage ? (
          <p className="text-sm text-muted-foreground">Checking what uses it…</p>
        ) : blocked ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-destructive">This {noun} is still scheduled to be used.</p>
            <ul className="list-inside list-disc text-muted-foreground">
              {usage.recurringRules > 0 && (
                <li>
                  {usage.recurringRules} recurring rule{usage.recurringRules === 1 ? '' : 's'}
                </li>
              )}
              {usage.installments > 0 && (
                <li>
                  {usage.installments} installment plan{usage.installments === 1 ? '' : 's'}
                </li>
              )}
            </ul>
            <p className="text-muted-foreground">
              They would keep creating transactions against {target.kind === 'account' ? 'an' : 'a'} {noun} that no
              longer exists. Delete or repoint them first, then come back.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {usage.transactions === 0
                ? `Nothing is recorded against this ${noun}.`
                : `${usage.transactions} transaction${usage.transactions === 1 ? '' : 's'} reference${usage.transactions === 1 ? 's' : ''} it.`}
            </p>
            {usage.transactions > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setWithTransactions(false)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left',
                    !withTransactions ? 'border-primary bg-primary/5' : 'border-border',
                  )}
                >
                  <span className="block font-medium">Keep the transactions</span>
                  <span className="block text-xs text-muted-foreground">
                    History stays in reports and still shows "{target.name}".
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setWithTransactions(true)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left',
                    withTransactions ? 'border-destructive bg-destructive/5' : 'border-border',
                  )}
                >
                  <span className="block font-medium text-destructive">Delete them too</span>
                  <span className="block text-xs text-muted-foreground">
                    Removes {usage.transactions} record{usage.transactions === 1 ? '' : 's'} from every total.
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={blocked || isPending || remove.isPending}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
