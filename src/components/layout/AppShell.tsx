import { useState, type ComponentType, type ReactNode } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, CloudOff, LayoutDashboard, Plus, Receipt, Settings as SettingsIcon, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { cn } from '@/lib/utils'
import { useOnline } from '@/hooks/useOnline'
import { useHousehold } from '@/lib/HouseholdContext'
import { monthLabel, shiftMonth } from '@/lib/month'
import type { PersonFilter } from '@/lib/filters'

// The 'home' key is kept for the Overview tab so links/bookmarks carrying
// ?tab=home keep working (DESIGN.md §7.1 v3.1).
export type Tab = 'home' | 'transactions' | 'accounts' | 'plan' | 'settings'

const TABS: { key: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'transactions', label: 'Records', icon: Receipt },
  { key: 'home', label: 'Overview', icon: LayoutDashboard },
  { key: 'accounts', label: 'Accounts', icon: Wallet },
  { key: 'plan', label: 'Plan', icon: CalendarClock },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
]

// Only these tabs are scoped by month/person, so only they get the filter
// header — Accounts shows current state and Plan is forward-looking
// (DESIGN.md §7.1 v3.1). The state itself stays global, so switching away
// and back never resets it.
const FILTERED_TABS: Tab[] = ['transactions', 'home']

interface Props {
  month: string
  onMonthChange: (month: string) => void
  person: PersonFilter
  onPersonChange: (person: PersonFilter) => void
  tab: Tab
  onTabChange: (tab: Tab) => void
  onQuickAdd: () => void
  children: ReactNode
}

export function AppShell({ month, onMonthChange, person, onPersonChange, tab, onTabChange, onQuickAdd, children }: Props) {
  const { members } = useHousehold()
  const online = useOnline()
  const [pickerOpen, setPickerOpen] = useState(false)

  const personOptions: { value: PersonFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...members.map((m) => ({ value: m.id, label: m.display_name })),
    { value: 'shared', label: 'Shared' },
  ]

  const showFilters = FILTERED_TABS.includes(tab)
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? ''

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 space-y-2 border-b bg-linear-to-r from-secondary/70 via-background/95 to-accent/60 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
        {!online && (
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <CloudOff className="size-3.5" />
            ออฟไลน์อยู่ — แสดงข้อมูลล่าสุดที่บันทึกไว้
          </div>
        )}
        {showFilters ? (
          <>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-lg px-3 py-1 font-heading text-sm font-medium transition-colors active:bg-accent"
              >
                {monthLabel(month)}
              </button>
              <Button variant="ghost" size="icon" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {personOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onPersonChange(opt.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    person === opt.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <h1 className="text-center font-heading text-sm font-medium">{tabLabel}</h1>
        )}
      </header>

      {pickerOpen && (
        <MonthYearPicker month={month} onSelect={onMonthChange} onClose={() => setPickerOpen(false)} />
      )}

      <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+6rem)]">{children}</main>

      <Button
        onClick={onQuickAdd}
        size="icon"
        className="gradient-love fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-20 size-14 rounded-full border-0 text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
        aria-label="Quick add"
      >
        <Plus className="size-6" />
      </Button>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors active:bg-accent/60',
              tab === key ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
