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
// grid instead of opening a second overlay on top of the page. A two-up
// grid rather than one row per instrument: most households have a handful
// of accounts and cards, and a single-column list left most of that width
// empty while pushing the panel taller than it needed to be.
// InstrumentSelect itself stays in use where a plain dropdown still fits
// (SettleUpSheet, which isn't part of this redesign).
export function InstrumentPickerPanel({ value, onChange }: Props) {
  const { householdId } = useHousehold()
  const { data: accounts } = useAccounts(householdId)
  const { data: cards } = useCards(householdId)

  const visibleAccounts = (accounts ?? []).filter((a) => !a.archived)
  const visibleCards = (cards ?? []).filter((c) => !c.archived)

  return (
    <div className="max-h-full space-y-2.5 overflow-y-auto">
      {visibleAccounts.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium text-muted-foreground">Accounts</p>
          <div className="grid grid-cols-2 gap-1.5">
            {visibleAccounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange({ accountId: a.id, cardId: null })}
                className={cn(
                  'flex items-center justify-between gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  value.accountId === a.id ? 'border-primary bg-primary/10' : 'border-border',
                )}
              >
                <span className="truncate">{a.name}</span>
                {value.accountId === a.id && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {visibleCards.length > 0 && (
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium text-muted-foreground">Cards</p>
          <div className="grid grid-cols-2 gap-1.5">
            {visibleCards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ accountId: null, cardId: c.id })}
                className={cn(
                  'flex items-center justify-between gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  value.cardId === c.id ? 'border-primary bg-primary/10' : 'border-border',
                )}
              >
                <span className="truncate">{c.name}</span>
                {value.cardId === c.id && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
