import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHousehold } from '@/lib/HouseholdContext'
import { formatBaht } from '@/lib/format'
import { useConfirmTransaction, useUnconfirmedTransactions, type Transaction } from '@/lib/transactions'

interface Props {
  onEdit: (transaction: Transaction) => void
}

// Generated recurring rows awaiting review (DESIGN §6.6/§7.3): confirm in
// one tap, or tap the row to adjust the amount first (saving confirms).
export function ReviewStrip({ onEdit }: Props) {
  const { householdId } = useHousehold()
  const { data: pending } = useUnconfirmedTransactions(householdId)
  const confirm = useConfirmTransaction(householdId)

  if (!pending || pending.length === 0) return null

  return (
    <section className="mb-4 space-y-1.5 rounded-2xl border border-warning-foreground/25 bg-warning p-3">
      <h3 className="font-heading text-xs font-medium text-warning-foreground">
        To review ({pending.length})
      </h3>
      <ul className="space-y-1">
        {pending.map((t) => {
          const label = t.note || t.kind
          return (
            <li key={t.id} className="flex items-center gap-2">
              <button onClick={() => onEdit(t)} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-warning-foreground/10">
                <span className="block truncate">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.date} · {formatBaht(t.amount)}
                </span>
              </button>
              <Button
                size="icon"
                variant="outline"
                className="size-8 shrink-0 border-warning-foreground/30 text-warning-foreground hover:bg-warning-foreground/10"
                onClick={() => confirm.mutate(t.id)}
                disabled={confirm.isPending}
                aria-label={`Confirm ${label}`}
              >
                <Check className="size-4" />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
