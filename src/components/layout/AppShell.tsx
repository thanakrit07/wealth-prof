import { useState, type ComponentType, type ReactNode } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, CloudOff, Plus, Receipt, Search, Settings as SettingsIcon, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MonthYearPicker } from '@/components/MonthYearPicker'
import { cn } from '@/lib/utils'
import { useOnline } from '@/hooks/useOnline'
import { useHousehold } from '@/lib/HouseholdContext'
import { monthLabel, shiftMonth } from '@/lib/month'
import type { PersonFilter } from '@/lib/filters'

// D-0004: three tabs split by time horizon, not by the kind of object each
// holds. Records is scoped to a month; Balances (now) and Upcoming (ahead)
// never are, which is what decides whether the month/person header shows.
export type Tab = 'records' | 'balances' | 'upcoming'

const TABS: { key: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'records', label: 'Records', icon: Receipt },
  { key: 'balances', label: 'Balances', icon: Wallet },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock },
]

interface Props {
  month: string
  onMonthChange: (month: string) => void
  person: PersonFilter
  onPersonChange: (person: PersonFilter) => void
  tab: Tab
  onTabChange: (tab: Tab) => void
  onQuickAdd: () => void
  onOpenSettings: () => void
  search: string
  onSearchChange: (search: string) => void
  children: ReactNode
}

export function AppShell({
  month,
  onMonthChange,
  person,
  onPersonChange,
  tab,
  onTabChange,
  onQuickAdd,
  onOpenSettings,
  search,
  onSearchChange,
  children,
}: Props) {
  const { members } = useHousehold()
  const online = useOnline()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const personOptions: { value: PersonFilter; label: string }[] = [
    ...members.map((m) => ({ value: m.id, label: m.display_name })),
    { value: 'all', label: 'All' },
  ]

  const isRecords = tab === 'records'
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? ''

  function closeSearch() {
    setSearchOpen(false)
    onSearchChange('')
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 space-y-2 border-b bg-linear-to-r from-secondary/70 via-background/95 to-accent/60 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
        {!online && (
          <div className="flex items-center justify-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <CloudOff className="size-3.5" />
            Offline — showing the last data saved
          </div>
        )}

        {isRecords && searchOpen ? (
          <div className="flex items-center gap-1.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search notes, categories, accounts…"
              className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={closeSearch} aria-label="Close search">
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            {isRecords ? (
              <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} aria-label="Search">
                <Search className="size-4" />
              </Button>
            ) : (
              <span className="size-9" />
            )}

            {isRecords ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month">
                  <ChevronLeft className="size-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-lg px-2 py-1 font-heading text-sm font-medium transition-colors active:bg-accent"
                >
                  {monthLabel(month)}
                </button>
                <Button variant="ghost" size="icon" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : (
              <h1 className="font-heading text-sm font-medium">{tabLabel}</h1>
            )}

            <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings">
              <SettingsIcon className="size-4" />
            </Button>
          </div>
        )}

        {isRecords && !searchOpen && (
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
        )}
      </header>

      {pickerOpen && (
        <MonthYearPicker month={month} onSelect={onMonthChange} onClose={() => setPickerOpen(false)} />
      )}

      {/* 9rem clears the FAB, which spans 5rem–8.5rem above the safe area:
          with less, the last line of a screen's content sits under it. */}
      <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+9rem)]">{children}</main>

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
