import { cn } from '@/lib/utils'

interface Member {
  id: string
  display_name: string
}

interface Props {
  members: Member[]
  selfId: string
  value: string | null
  onChange: (ownerId: string | null) => void
}

// A Recurring Rule or Installment Plan has nowhere to persist an uneven
// Custom split yet — every period/occurrence it generates still goes
// through computeShareRows' owner_id heuristic (0024), not an explicit
// breakdown — so this offers exactly the three states that heuristic can
// express, in Who-bears language, rather than a Custom panel that would
// look real but write nothing. The full per-amount panel is TransactionSheet's
// WhoBearsField; this is the reduced version for a template, not an entry.
export function SimpleWhoBears({ members, selfId, value, onChange }: Props) {
  const self = members.find((m) => m.id === selfId)
  const others = members.filter((m) => m.id !== selfId)

  const options: { key: string; label: string; ownerId: string | null }[] = [
    { key: 'you', label: self?.display_name ?? 'You', ownerId: selfId },
    ...(others.length > 0 ? [{ key: 'split', label: 'Split evenly', ownerId: null }] : []),
    ...others.map((m) => ({ key: m.id, label: m.display_name, ownerId: m.id })),
  ]

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.ownerId)}
          className={cn(
            'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === opt.ownerId ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
