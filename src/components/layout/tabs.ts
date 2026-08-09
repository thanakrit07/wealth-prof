import { CalendarClock, Receipt, Wallet, type LucideIcon } from 'lucide-react'
import type { Tab } from './tab-type'

// D-0004: three tabs split by time horizon, not by the kind of object each
// holds. Shared between AppShell's mobile bottom nav and NavRail's desktop
// rail so the two don't drift on labels, icons or ordering.
export const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'records', label: 'Records', icon: Receipt },
  { key: 'balances', label: 'Balances', icon: Wallet },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock },
]
