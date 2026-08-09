import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROWS = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['C', '0', '.', '+'],
] as const

interface Props {
  onKey: (key: string) => void
  onEquals: () => void
  onDone: () => void
}

// Bottom-panel calculator backing the amount field (DESIGN.md §7.2 D9): the
// system numeric keyboard never opens for amounts, which is what was
// shrinking the viewport and shoving the whole sheet up on iOS.
export function Keypad({ onKey, onEquals, onDone }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-1.5">
        {ROWS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            className={cn(
              'flex h-12 items-center justify-center rounded-lg text-lg font-medium transition-colors active:scale-95',
              key === 'C'
                ? 'bg-destructive/10 text-destructive'
                : ['÷', '×', '-', '+'].includes(key)
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-muted text-foreground',
            )}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onKey('⌫')}
          aria-label="Backspace"
          className="col-span-2 flex h-12 items-center justify-center rounded-lg bg-muted text-foreground transition-colors active:scale-95"
        >
          <Delete className="size-5" />
        </button>
        <button
          type="button"
          onClick={onEquals}
          className="col-span-2 flex h-12 items-center justify-center rounded-lg bg-primary text-lg font-semibold text-primary-foreground transition-opacity active:opacity-90"
        >
          =
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm text-muted-foreground transition-colors active:bg-accent"
      >
        Done
      </button>
    </div>
  )
}
