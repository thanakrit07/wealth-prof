import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { currentMonthKey } from '@/lib/month'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  month: string // yyyy-MM
  onSelect: (month: string) => void
  onClose: () => void
}

// Month-year picker drawer (DESIGN.md §7.1 v3.1, Money Manager pattern):
// a year stepper over a 12-month grid, so reaching "March last year" is
// two taps instead of twelve on the ‹ chevron.
export function MonthYearPicker({ month, onSelect, onClose }: Props) {
  const [selectedYear, selectedMonth0] = month.split('-').map(Number)
  const [year, setYear] = useState(selectedYear)
  const now = currentMonthKey()

  function pick(month0: number) {
    onSelect(`${year}-${String(month0 + 1).padStart(2, '0')}`)
    onClose()
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader className="flex-row items-center justify-between">
          <DrawerTitle>Select month</DrawerTitle>
          <button
            type="button"
            onClick={() => {
              onSelect(now)
              onClose()
            }}
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            This month
          </button>
        </DrawerHeader>

        <div className="space-y-3 px-4 pb-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-heading text-sm font-medium">{year}</span>
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((label, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`
              const isSelected = year === selectedYear && i + 1 === selectedMonth0
              const isCurrent = key === now
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => pick(i)}
                  className={cn(
                    'rounded-lg border py-2.5 text-sm transition-colors active:scale-95',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                        ? 'border-primary/40 text-primary'
                        : 'border-border',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
