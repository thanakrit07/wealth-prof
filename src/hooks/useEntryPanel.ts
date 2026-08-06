import { useState } from 'react'

// The one piece of state behind the shared bottom picker panel (v3.6,
// ADR-0006): which row's picker is open, if any. Opening a row implicitly
// closes whichever other one was open — there is never more than one panel
// kind active at a time — and focusing a free-text field (Note, Details)
// closes it outright by calling `close`.
export function useEntryPanel<T extends string>() {
  const [active, setActive] = useState<T | null>(null)
  return {
    active,
    close: () => setActive(null),
    toggle: (key: T) => setActive((prev) => (prev === key ? null : key)),
  }
}
