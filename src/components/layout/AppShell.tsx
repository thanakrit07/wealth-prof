import type { ComponentType, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Home, Plus, Receipt, Settings as SettingsIcon, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useHousehold } from '@/lib/HouseholdContext'
import { monthLabel, shiftMonth } from '@/lib/month'
import type { PersonFilter } from '@/lib/filters'

export type Tab = 'home' | 'transactions' | 'accounts' | 'settings'

const TABS: { key: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'transactions', label: 'Transactions', icon: Receipt },
  { key: 'accounts', label: 'Accounts', icon: Wallet },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
]

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

  const personOptions: { value: PersonFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...members.map((m) => ({ value: m.id, label: m.display_name })),
    { value: 'shared', label: 'Shared' },
  ]

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 space-y-2 border-b bg-linear-to-r from-secondary/70 via-background/95 to-accent/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-heading text-sm font-medium">{monthLabel(month)}</span>
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
      </header>

      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      <Button
        onClick={onQuickAdd}
        size="icon"
        className="gradient-love fixed bottom-20 right-4 z-20 size-14 rounded-full border-0 text-white shadow-lg shadow-primary/30"
        aria-label="Quick add"
      >
        <Plus className="size-6" />
      </Button>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background/95 backdrop-blur">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-xs',
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
