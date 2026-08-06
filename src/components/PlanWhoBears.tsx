import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { formatBaht } from '@/lib/format'
import type { RatioSplit } from '@/lib/transactionShares'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  display_name: string
}

export interface PlanWhoBearsValue {
  // Used whenever split is null — the same owner_id heuristic every plan
  // and rule has always resolved through (D13's other three cases).
  ownerId: string | null
  // Non-null only in Custom mode: ratios summing to 1, reapplied to
  // whatever a given period/occurrence actually charges (0026) — never a
  // fixed amount, since a plan's own periods don't all charge the same one.
  split: RatioSplit[] | null
}

interface Props {
  members: Member[]
  selfId: string
  value: PlanWhoBearsValue
  onChange: (value: PlanWhoBearsValue) => void
  // What Custom's amount inputs are shown against and converted to/from
  // ratio by — the plan's per-period figure, or the rule's own amount.
  referenceAmount: number
}

type Mode = 'you' | 'split' | 'custom' | string // string = a specific other member's id

// The richer sibling of SimpleWhoBears: a Recurring Rule or Installment Plan
// now has somewhere to persist an uneven split too (0026), so Custom is a
// real fourth option here, not the stripped-down three SimpleWhoBears offers
// where it would have had nowhere to write.
export function PlanWhoBears({ members, selfId, value, onChange, referenceAmount }: Props) {
  const others = members.filter((m) => m.id !== selfId)
  const mode: Mode = value.split ? 'custom' : value.ownerId === null ? 'split' : value.ownerId

  // Custom's inputs are amounts against referenceAmount, converted to ratio
  // on change — typing "60" against a ฿100 reference sets that member's
  // ratio to 0.6, which is what actually gets stored and reapplied later.
  const customAmounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of value.split ?? []) out[s.member_id] = referenceAmount > 0 ? s.ratio * referenceAmount : 0
    return out
  }, [value.split, referenceAmount])
  const customTotal = Object.values(customAmounts).reduce((sum, v) => sum + (v || 0), 0)
  const customMatches = referenceAmount > 0 && Math.round(customTotal * 100) === Math.round(referenceAmount * 100)

  function selectMode(next: Mode) {
    if (next === 'custom') {
      const seed: Record<string, number> =
        Object.keys(customAmounts).length > 0
          ? customAmounts
          : Object.fromEntries(members.map((m) => [m.id, referenceAmount / Math.max(members.length, 1)]))
      onChange({ ownerId: selfId, split: toRatios(seed, referenceAmount) })
    } else if (next === 'split') {
      onChange({ ownerId: null, split: null })
    } else if (next === 'you') {
      onChange({ ownerId: selfId, split: null })
    } else {
      onChange({ ownerId: next, split: null })
    }
  }

  function setCustomAmount(memberId: string, raw: string) {
    const n = Number(raw)
    const next = { ...customAmounts, [memberId]: Number.isFinite(n) ? n : 0 }
    onChange({ ownerId: selfId, split: toRatios(next, referenceAmount) })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'you', label: members.find((m) => m.id === selfId)?.display_name ?? 'You' },
            ...(others.length > 0 ? [{ key: 'split', label: 'Split evenly' }] : []),
            ...others.map((m) => ({ key: m.id, label: m.display_name })),
            ...(others.length > 0 ? [{ key: 'custom', label: 'Custom' }] : []),
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => selectMode(opt.key)}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              mode === opt.key ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'custom' && (
        <div className="space-y-1.5 rounded-xl border bg-card p-2.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{m.display_name}</span>
              <Input
                type="number"
                inputMode="decimal"
                value={customAmounts[m.id] ?? 0}
                onChange={(e) => setCustomAmount(m.id, e.target.value)}
                className="h-8 w-24 text-right tabular-nums"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-1.5 text-xs text-muted-foreground">
            <span>Total</span>
            <span className={customMatches ? 'text-good' : 'text-destructive'}>
              {formatBaht(customTotal)}
              {customMatches ? ' ✓' : referenceAmount > 0 ? ` of ${formatBaht(referenceAmount)}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function toRatios(amounts: Record<string, number>, referenceAmount: number): RatioSplit[] {
  if (referenceAmount <= 0) return []
  return Object.entries(amounts)
    .map(([member_id, amount]) => ({ member_id, ratio: amount / referenceAmount }))
    .filter((r) => r.ratio > 0)
}
