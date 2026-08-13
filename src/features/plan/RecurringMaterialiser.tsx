import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/lib/HouseholdContext'
import { materialiseDue, useRecurringRules } from '@/lib/recurring'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const MIN_INTERVAL_MS = 5 * 60_000

// Runs recurrence materialisation on app open and on regaining focus
// (DESIGN §6.6 — no cron needed; the unique constraint makes concurrent
// runs from both phones harmless). Renders nothing.
//
// Always re-fetches the rule list itself right before materialising,
// rather than trusting whatever's already in the query cache: that cache
// can be up to 7 days stale (queryClient.ts's persister) and nothing
// invalidates it when a row changes outside the app — directly in
// Supabase, say. A rule deleted that way but still sitting in a stale
// local cache would otherwise get "materialised" all over again the next
// time this ran, silently recreating transactions for a rule that no
// longer exists.
export function RecurringMaterialiser() {
  const { householdId } = useHousehold()
  const { refetch } = useRecurringRules(householdId)
  const queryClient = useQueryClient()
  const lastRun = useRef(0)

  useEffect(() => {
    async function run() {
      if (Date.now() - lastRun.current < MIN_INTERVAL_MS) return
      lastRun.current = Date.now()
      try {
        const { data: current } = await refetch()
        if (!current || current.length === 0) return
        const generated = await materialiseDue(householdId, current, todayIso())
        if (generated > 0) {
          queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
        }
      } catch (error) {
        // Non-fatal: the next open/focus retries from the same watermark.
        console.error('Recurring materialisation failed', error)
        lastRun.current = 0
      }
    }

    run()
    const onFocus = () => run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, queryClient])

  return null
}
