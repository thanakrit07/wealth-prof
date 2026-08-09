// D-0004: three tabs split by time horizon, not by the kind of object each
// holds. Split into its own module so AppShell, NavRail and tabs.ts can all
// depend on it without a circular import between AppShell and tabs.ts.
export type Tab = 'records' | 'balances' | 'upcoming'
