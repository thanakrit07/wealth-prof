import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/lib/HouseholdContext'
import { materialiseInstallmentsDue } from '@/lib/installmentMaterialiser'
import { useInstallments } from '@/lib/installments'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const MIN_INTERVAL_MS = 5 * 60_000

// Posts due installment periods on app open and on regaining focus (DESIGN
// §6.7/§4.5 — mirrors RecurringMaterialiser). Renders nothing.
export function InstallmentMaterialiser() {
  const { householdId } = useHousehold()
  const { data: installments } = useInstallments(householdId)
  const queryClient = useQueryClient()
  const lastRun = useRef(0)
  const installmentsRef = useRef(installments)
  installmentsRef.current = installments

  useEffect(() => {
    async function run() {
      const current = installmentsRef.current
      if (!current || current.length === 0) return
      if (Date.now() - lastRun.current < MIN_INTERVAL_MS) return
      lastRun.current = Date.now()
      try {
        const posted = await materialiseInstallmentsDue(householdId, current, todayIso())
        if (posted > 0) {
          queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
          queryClient.invalidateQueries({ queryKey: ['installments', householdId] })
          queryClient.invalidateQueries({ queryKey: ['installment_payments', householdId] })
        }
      } catch (error) {
        // Non-fatal: the next open/focus retries the same unpaid periods.
        console.error('Installment materialisation failed', error)
        lastRun.current = 0
      }
    }

    if (installments) run()
    const onFocus = () => run()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, installments != null, queryClient])

  return null
}
