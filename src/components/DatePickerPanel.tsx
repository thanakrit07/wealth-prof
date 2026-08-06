import { format, parse } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { toBuddhistYear } from '@/lib/month'

interface Props {
  value: string // yyyy-MM-dd
  onChange: (value: string) => void
  clearable?: boolean
}

// The calendar's content for the shared bottom panel (v3.6, ADR-0006) —
// sized to sit alongside the keypad and category grid instead of DateField's
// own inline-expanding version, which pushed whatever was below it down the
// page each time it opened.
export function DatePickerPanel({ value, onChange, clearable }: Props) {
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  return (
    <div className="flex max-h-full flex-col items-center gap-1 overflow-y-auto">
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        onSelect={(d) => {
          if (!d) return
          onChange(format(d, 'yyyy-MM-dd'))
        }}
        formatters={{
          formatCaption: (month) => `${format(month, 'MMMM')} ${toBuddhistYear(month.getFullYear())}`,
        }}
        fixedWeeks
        // The Calendar component's own default className paints bg-background
        // — a different token from this panel's bg-popover (EntryPage), which
        // is what showed up as a mismatched rectangle behind the grid.
        className="w-9/10 bg-transparent"
      />
      {clearable && selected && (
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => onChange('')}>
          Clear
        </Button>
      )}
    </div>
  )
}
