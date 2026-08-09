import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

// The third desktop-only region (rail · content · summary). Fully
// self-gated on the `lg` breakpoint via CSS — unlike NavRail, this isn't a
// landmark that would duplicate on mobile, so it doesn't need the
// useIsDesktop JS switch; it simply renders nothing visible below `lg`.
// Content is supplied per-screen (only Records fills it today).
export function SummaryColumn({ children }: Props) {
  return (
    <aside className="hidden w-76 shrink-0 flex-col gap-6 overflow-y-auto border-l bg-background p-4 lg:flex">
      {children}
    </aside>
  )
}
