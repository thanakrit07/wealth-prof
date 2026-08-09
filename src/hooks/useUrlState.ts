import { useCallback, useEffect, useState } from 'react'

// Keeps a piece of UI state (active tab, selected month, person filter) in
// the URL query string, so a refresh or shared link keeps the same context
// (DESIGN.md §7.1: "never re-set per screen").
//
// Module-level (shared across every useUrlState instance, not per-hook):
// several call sites fire two of these in the same handler — opening an
// account sets both `acct` and `tab` (App.tsx's onOpenAccount) — and each
// is its own hook instance with its own key. Pushing a history entry per
// *call* rather than per *user action* would mean Back has to be pressed
// twice to undo one tap. Queuing all updates from the same synchronous
// batch into one microtask and pushing a single history entry from it
// keeps one user action to one Back step, regardless of how many
// useUrlState keys it touches.
let pending: URLSearchParams | null = null
let flushQueued = false

function flush() {
  flushQueued = false
  if (!pending) return
  const query = pending.toString()
  window.history.pushState(null, '', query ? `?${query}` : window.location.pathname)
  pending = null
}

function readParam(key: string, defaultValue: string): string {
  const params = new URLSearchParams(window.location.search)
  return params.get(key) ?? defaultValue
}

export function useUrlState(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => readParam(key, defaultValue))

  // Resync when the user navigates with the browser's own Back/Forward —
  // previously nothing listened for this at all, so those buttons did
  // nothing anywhere in the app.
  useEffect(() => {
    function onPopState() {
      setValue(readParam(key, defaultValue))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [key, defaultValue])

  const update = useCallback(
    (next: string) => {
      setValue(next)
      if (!pending) pending = new URLSearchParams(window.location.search)
      if (next === defaultValue) {
        pending.delete(key)
      } else {
        pending.set(key, next)
      }
      if (!flushQueued) {
        flushQueued = true
        queueMicrotask(flush)
      }
    },
    [key, defaultValue],
  )

  return [value, update] as const
}
