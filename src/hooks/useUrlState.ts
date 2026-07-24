import { useCallback, useState } from 'react'

// Keeps a piece of UI state (active tab, selected month, person filter) in
// the URL query string, so a refresh or shared link keeps the same context
// (DESIGN.md §7.1: "never re-set per screen").
export function useUrlState(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get(key) ?? defaultValue
  })

  const update = useCallback(
    (next: string) => {
      setValue(next)
      const params = new URLSearchParams(window.location.search)
      if (next === defaultValue) {
        params.delete(key)
      } else {
        params.set(key, next)
      }
      const query = params.toString()
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    },
    [key, defaultValue],
  )

  return [value, update] as const
}
