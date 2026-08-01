import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/lib/HouseholdContext'
import { materialiseInstallmentsDue } from '@/lib/installmentMaterialiser'
import { useInstallments } from '@/lib/installments'

// Posts every unposted installment period on app open, on regaining focus,
// and whenever the plan list itself changes — so a plan created just now
// has its whole schedule in the ledger before the sheet finishes closing
// (DESIGN §6.7/§4.5). Renders nothing.
export function InstallmentMaterialiser() {
  const { householdId } = useHousehold()
  const { data: installments } = useInstallments(householdId)
  const queryClient = useQueryClient()
  const running = useRef(false)
  const installmentsRef = useRef(installments)
  installmentsRef.current = installments

  // Keyed on the set of plans and their schedules rather than a timer: the
  // work is a no-op once every period is posted, and reacting to the plan
  // list is what makes a brand-new plan appear immediately.
  const planKey = (installments ?? [])
    .map((i) => `${i.id}:${i.status}:${i.total_periods}:${i.start_date}`)
    .join('|')

  useEffect(() => {
    async function run() {
      const current = installmentsRef.current
      if (!current || current.length === 0) return
      if (running.current) return
      running.current = true
      try {
        const posted = await materialiseInstallmentsDue(householdId, current)
        if (posted > 0) {
          queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
          queryClient.invalidateQueries({ queryKey: ['installments', householdId] })
          queryClient.invalidateQueries({ queryKey: ['installment_payments', householdId] })
        }
      } catch (error) {
        // Non-fatal: the next open/focus retries the same unposted periods.
        console.error('Installment materialisation failed', error)
      } finally {
        running.current = false
      }
    }

    if (installments) run()
    const onFocus = () => run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, planKey, queryClient])

  return null
}
