import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/lib/HouseholdContext'
import { materialiseInstallmentsDue } from '@/lib/installmentMaterialiser'
import { useInstallments } from '@/lib/installments'

// Posts every unposted installment period on app open, on regaining focus,
// and whenever the plan list itself changes — so a plan created just now
// has its whole schedule in the ledger before the sheet finishes closing
// (DESIGN §6.7/§4.5). Renders nothing.
//
// Always re-fetches the plan list itself right before materialising,
// rather than trusting whatever's already in the query cache: that cache
// can be up to 7 days stale (queryClient.ts's persister) and nothing
// invalidates it when a row is changed outside the app — directly in
// Supabase, say. A plan deleted that way but still sitting in a stale
// local cache would otherwise get "materialised" all over again the next
// time this ran, silently recreating transactions for a plan that no
// longer exists.
export function InstallmentMaterialiser() {
  const { householdId } = useHousehold()
  const { data: installments, refetch } = useInstallments(householdId)
  const queryClient = useQueryClient()
  const running = useRef(false)
  // Set when a run is requested while one is already in flight. Dropping that
  // request instead of queueing it is how a plan created moments after a big
  // catch-up batch ended up with no periods at all: the only thing that would
  // have retried was a focus event that may never come.
  const rerunRequested = useRef(false)

  // Keyed on the set of plans and their schedules rather than a timer: the
  // work is a no-op once every period is posted, and reacting to the plan
  // list is what makes a brand-new plan appear immediately. Only used to
  // decide *when* to kick off a run — the run itself always re-fetches.
  const planKey = (installments ?? [])
    .map((i) => `${i.id}:${i.status}:${i.total_periods}:${i.start_date}`)
    .join('|')

  useEffect(() => {
    async function run() {
      if (running.current) {
        rerunRequested.current = true
        return
      }
      running.current = true
      try {
        do {
          rerunRequested.current = false
          const { data: current } = await refetch()
          if (!current || current.length === 0) return
          const posted = await materialiseInstallmentsDue(householdId, current)
          if (posted > 0) {
            queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
            queryClient.invalidateQueries({ queryKey: ['installment_posted_periods', householdId] })
            queryClient.invalidateQueries({ queryKey: ['installments', householdId] })
            queryClient.invalidateQueries({ queryKey: ['installment_payments', householdId] })
          }
          // Refetches again on the next iteration, so a plan added or
          // deleted mid-run is picked up by this same pass rather than
          // waiting for a focus event.
        } while (rerunRequested.current)
      } catch (error) {
        // Non-fatal: the next open/focus retries the same unposted periods.
        console.error('Installment materialisation failed', error)
      } finally {
        running.current = false
        rerunRequested.current = false
      }
    }

    run()
    const onFocus = () => run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, planKey, queryClient])

  return null
}
