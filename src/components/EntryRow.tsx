import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: React.ReactNode
  placeholder?: boolean
  active: boolean
  onClick: () => void
}

// A row that opens the shared bottom panel (v3.6, ADR-0006) instead of
// expanding inline — Category, Account/card and Date all use this now, so
// tapping any of them reads the same way as tapping the Amount field.
export function EntryRow({ label, value, placeholder, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        active ? 'border-primary' : 'border-input',
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('flex items-center gap-1.5', placeholder && 'text-muted-foreground')}>
        {value}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', active && 'rotate-180')} />
      </span>
    </button>
  )
}
