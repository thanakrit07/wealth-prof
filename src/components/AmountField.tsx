import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface Props {
  label?: string
  placeholder?: string
  expr: string
  active: boolean
  onActivate: () => void
  size?: 'lg' | 'sm'
}

// A tappable amount display, not a text input — the in-app Keypad (DESIGN.md
// §7.2 D9) is the only way to edit it, so the system numeric keyboard never
// opens for money fields (the fix for the iOS "keyboard shoves the sheet up"
// bug). `size="lg"` is the sheet's single primary amount (transaction,
// recurring rule); `size="sm"` is for secondary fields sharing a row
// (installment's per-period / final-period amounts).
export function AmountField({ label, placeholder = '0.00', expr, active, onActivate, size = 'sm' }: Props) {
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <button
        type="button"
        onClick={onActivate}
        className={cn(
          'flex w-full items-center justify-center rounded-lg border font-semibold transition-colors',
          size === 'lg' ? 'h-14 text-3xl' : 'h-10 text-base',
          active ? 'border-primary bg-primary/5' : 'border-input',
        )}
      >
        {expr ? <span className="truncate px-2">{expr}</span> : <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    </div>
  )
}
