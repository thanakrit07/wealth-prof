import { useState } from 'react'
import { format, parse } from 'date-fns'
import { ChevronDown } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { toBuddhistYear } from '@/lib/month'
import { cn } from '@/lib/utils'

interface Props {
  id?: string
  value: string // yyyy-MM-dd
  onChange: (value: string) => void
  // Renders "Not set" and offers a Clear action instead of always holding a
  // date (recurring_rules.end_date — null means open-ended, DESIGN §4.4).
  clearable?: boolean
  placeholder?: string
}

// ADR-0005: the app owns date entry instead of a native <input type="date">,
// which renders the device locale's own calendar and cannot be made to agree
// with the Buddhist-Era year shown everywhere else in the app — two phones
// with different locales would show different years in the same field. Opens
// below the field rather than as a system overlay, the same reasoning D9
// applied to the amount keypad.
export function DateField({ id, value, onChange, clearable, placeholder = 'Not set' }: Props) {
  const [open, setOpen] = useState(false)
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  return (
    <div>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
          open ? 'border-primary' : 'border-input',
        )}
      >
        <span className={cn(!selected && 'text-muted-foreground')}>
          {selected ? `${format(selected, 'd MMM')} ${toBuddhistYear(selected.getFullYear())}` : placeholder}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col items-center gap-1 rounded-xl border bg-card p-1">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return
              onChange(format(d, 'yyyy-MM-dd'))
              setOpen(false)
            }}
            formatters={{
              formatCaption: (month) => `${format(month, 'MMMM')} ${toBuddhistYear(month.getFullYear())}`,
            }}
          />
          {clearable && selected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-1 w-full text-muted-foreground"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
