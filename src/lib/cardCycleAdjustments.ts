import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface CardCycleAdjustment {
  id: string
  card_id: string
  cycle_start: string
  amount: number
  note: string | null
}

export function useCardCycleAdjustments(householdId: string) {
  return useQuery({
    queryKey: ['card_cycle_adjustments', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_cycle_adjustments')
        .select('id, card_id, cycle_start, amount, note')
        .eq('household_id', householdId)
      if (error) throw error
      return data as CardCycleAdjustment[]
    },
  })
}

// Reconcile against the real statement (DESIGN §6.1/§7.3): upserts the
// signed delta for one card's cycle.
export function useSetCardCycleAdjustment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      cardId,
      cycleStart,
      amount,
      note,
    }: {
      cardId: string
      cycleStart: string
      amount: number
      note: string | null
    }) => {
      const { error } = await supabase
        .from('card_cycle_adjustments')
        .upsert(
          { household_id: householdId, card_id: cardId, cycle_start: cycleStart, amount, note },
          { onConflict: 'card_id,cycle_start' },
        )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card_cycle_adjustments', householdId] }),
  })
}
