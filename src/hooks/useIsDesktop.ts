import { useSyncExternalStore } from 'react'

// Tailwind's `lg` breakpoint (1024px) is also where AppShell swaps its
// mobile bottom-nav shell for the desktop nav-rail shell. That swap has to
// happen in JS, not CSS: rendering both navs and hiding one with a `hidden`
// class would leave two <nav aria-label="Sections"> landmarks in the
// accessibility tree at once.
const QUERY = '(min-width: 64rem)'

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// SSR/no-window guard; this app has no server render, but keeps the hook honest.
function getServerSnapshot() {
  return false
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
