import { Check } from 'lucide-react'
import { useAccounts } from '@/lib/accounts'
import { useCards } from '@/lib/cards'
import { useHousehold } from '@/lib/HouseholdContext'
import { cn } from '@/lib/utils'
import type { Instrument } from '@/components/InstrumentSelect'

interface Props {
  value: Instrument
  onChange: (instrument: Instrument) => void
}

// The account/card row's content for the shared bottom panel (v3.6,
// ADR-0006) — a flat tappable list instead of InstrumentSelect's own Radix
// popover, so it sits in the same panel as the keypad/calendar/category
// grid instead of opening a second overlay on top of the page.
// InstrumentSelect itself stays in use where a plain dropdown still fits
// (SettleUpSheet, which isn't part of this redesign).
export function InstrumentPickerPanel({ value, onChange }: Props) {
  const { householdId } = useHousehold()
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)

  const visibleAccounts = (accounts ?? []).filter((a) => !a.archived)
  const visibleCards = (cards ?? []).filter((c) => !c.archived)

  return (
    <div className="max-h-full space-y-3 overflow-y-auto">
      {visibleAccounts.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium text-muted-foreground">Accounts</p>
          {visibleAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange({ accountId: a.id, cardId: null })}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                value.accountId === a.id ? 'border-primary bg-primary/10' : 'border-border',
              )}
            >
              {a.name}
              {value.accountId === a.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
      {visibleCards.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium text-muted-foreground">Cards</p>
          {visibleCards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ accountId: null, cardId: c.id })}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                value.cardId === c.id ? 'border-primary bg-primary/10' : 'border-border',
              )}
            >
              {c.name}
              {value.cardId === c.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
