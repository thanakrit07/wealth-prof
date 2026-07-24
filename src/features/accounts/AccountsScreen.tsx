import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
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
import { useHousehold } from '@/lib/HouseholdContext'
import { formatBaht } from '@/lib/format'

export function AccountsScreen() {
  const { householdId } = useHousehold()
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)
  const [editingAccount, setEditingAccount] = useState<Account | 'new' | null>(null)
  const [editingCard, setEditingCard] = useState<Card | 'new' | null>(null)

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Accounts</h2>
          <Button size="sm" variant="outline" onClick={() => setEditingAccount('new')}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <ul className="space-y-1">
          {(accounts ?? []).map((account) => (
            <li key={account.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <Badge variant="secondary" className="capitalize">
                {account.type}
              </Badge>
              <span className={account.archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
                {account.name}
              </span>
              <span className="text-muted-foreground">{formatBaht(account.anchor_balance)}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditingAccount(account)} aria-label="Edit">
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
          {accounts?.length === 0 && <p className="text-sm text-muted-foreground">No accounts yet.</p>}
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
          {(cards ?? []).map((card) => (
            <li key={card.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className={card.archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{card.name}</span>
              <span className="text-muted-foreground">{formatBaht(card.credit_limit)} limit</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditingCard(card)} aria-label="Edit">
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
          {cards?.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
        </ul>
      </section>

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
    </div>
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
              <Input id="account-date" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
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
