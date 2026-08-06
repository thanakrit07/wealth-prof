import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatBaht } from '@/lib/format'
import { cn } from '@/lib/utils'

export type WhoBearsMode = 'you' | 'split' | 'custom'

export interface WhoBearsValue {
  mode: WhoBearsMode
  // Member id -> amount. Meaningful only when mode === 'custom' — "split"
  // is always computed fresh from the live amount at save time, so editing
  // the amount afterward never leaves it stale.
  custom: Record<string, number>
}

interface Member {
  id: string
  display_name: string
}

interface Props {
  amount: number
  members: Member[]
  selfId: string
  value: WhoBearsValue
  onChange: (value: WhoBearsValue) => void
}

export function evenSplit(amount: number, memberIds: string[]): Record<string, number> {
  const totalCents = Math.round(amount * 100)
  const base = Math.floor(totalCents / memberIds.length)
  const remainder = totalCents - base * memberIds.length
  const out: Record<string, number> = {}
  memberIds.forEach((id, i) => {
    out[id] = (base + (i < remainder ? 1 : 0)) / 100
  })
  return out
}

// D13/D14, §7.2 v3.5: replaces the Owner field. Defaults to "Just you" so
// anyone not sharing sees no new work; opens a panel with the three cases
// that cover every way a cost gets divided — including "I paid for their
// thing", which is Custom with the other person alone at 100%.
export function WhoBearsField({ amount, members, selfId, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const memberIds = useMemo(() => members.map((m) => m.id), [members])

  const label = useMemo(() => {
    if (value.mode === 'you') return members.find((m) => m.id === selfId)?.display_name ?? 'You'
    if (value.mode === 'split') return 'Split evenly'
    const bearers = memberIds.filter((id) => (value.custom[id] ?? 0) > 0)
    if (bearers.length === 1) return members.find((m) => m.id === bearers[0])?.display_name ?? 'Custom'
    return 'Custom'
  }, [value, members, selfId, memberIds])

  const customTotal = Object.values(value.custom).reduce((sum, v) => sum + (v || 0), 0)
  const customMatches = Math.round(customTotal * 100) === Math.round(amount * 100)

  function selectMode(mode: WhoBearsMode) {
    if (mode === 'custom') {
      // Seed from whatever's there, or an even split, so Custom opens with
      // valid numbers rather than a blank, all-zero panel.
      const seed = Object.keys(value.custom).length > 0 ? value.custom : evenSplit(amount, memberIds)
      onChange({ mode, custom: seed })
    } else {
      onChange({ mode, custom: {} })
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">Who bears</span>
        <span className="flex items-center gap-1.5">
          {label}
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-2.5 rounded-xl border bg-card p-2.5">
          <div className="flex gap-1.5">
            {(['you', 'split', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => selectMode(mode)}
                className={cn(
                  'flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors',
                  value.mode === mode ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
                )}
              >
                {mode === 'you' ? 'Just you' : mode === 'split' ? 'Split evenly' : 'Custom'}
              </button>
            ))}
          </div>

          {value.mode === 'custom' && (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{m.display_name}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={value.custom[m.id] ?? 0}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      onChange({ mode: 'custom', custom: { ...value.custom, [m.id]: Number.isFinite(n) ? n : 0 } })
                    }}
                    className="h-8 w-24 text-right tabular-nums"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-1.5 text-xs text-muted-foreground">
                <span>Total</span>
                <span className={customMatches ? 'text-good' : 'text-destructive'}>
                  {formatBaht(customTotal)}
                  {customMatches ? ' ✓' : ` of ${formatBaht(amount)}`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
