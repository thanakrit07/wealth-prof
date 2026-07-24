import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts } from '@/lib/accounts'
import { useCards } from '@/lib/cards'
import { useHousehold } from '@/lib/HouseholdContext'

export interface Instrument {
  accountId: string | null
  cardId: string | null
}

function encode(i: Instrument): string {
  return i.accountId ? `account:${i.accountId}` : i.cardId ? `card:${i.cardId}` : ''
}

function decode(value: string): Instrument {
  const [kind, id] = value.split(':')
  return { accountId: kind === 'account' ? id : null, cardId: kind === 'card' ? id : null }
}

interface Props {
  value: Instrument
  onChange: (instrument: Instrument) => void
  placeholder?: string
}

export function InstrumentSelect({ value, onChange, placeholder = 'Select account or card' }: Props) {
  const { householdId } = useHousehold()
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)
  const encoded = encode(value)

  return (
    <Select value={encoded} onValueChange={(v) => onChange(decode(v))}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Accounts</SelectLabel>
          {(accounts ?? [])
            .filter((a) => !a.archived)
            .map((a) => (
              <SelectItem key={a.id} value={`account:${a.id}`}>
                {a.name}
              </SelectItem>
            ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Cards</SelectLabel>
          {(cards ?? [])
            .filter((c) => !c.archived)
            .map((c) => (
              <SelectItem key={c.id} value={`card:${c.id}`}>
                {c.name}
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
