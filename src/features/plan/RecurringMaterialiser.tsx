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
export function RecurringMaterialiser() {
  const { householdId } = useHousehold()
  const { data: rules } = useRecurringRules(householdId)
  const queryClient = useQueryClient()
  const lastRun = useRef(0)
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  useEffect(() => {
    async function run() {
      const current = rulesRef.current
      if (!current || current.length === 0) return
      if (Date.now() - lastRun.current < MIN_INTERVAL_MS) return
      lastRun.current = Date.now()
      try {
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

    if (rules) run()
    const onFocus = () => run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, rules != null, queryClient])

  return null
}
