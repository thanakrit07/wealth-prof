import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface Card {
  id: string
  household_id: string
  name: string
  credit_limit: number
  statement_day: number
  due_day: number
  annual_interest_rate: number
  owner_id: string | null
  sort_order: number
  archived: boolean
}

export function useCards(householdId: string) {
  return useQuery({
    queryKey: ['cards', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_cards')
        .select('id, household_id, name, credit_limit, statement_day, due_day, annual_interest_rate, owner_id, sort_order, archived')
        .eq('household_id', householdId)
        .order('sort_order')
      if (error) throw error
      return data as Card[]
    },
  })
}

export function useCreateCard(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      creditLimit: number
      statementDay: number
      dueDay: number
      annualInterestRate: number
      ownerId: string | null
    }) => {
      const { error } = await supabase.from('cards').insert({
        household_id: householdId,
        name: input.name,
        credit_limit: input.creditLimit,
        statement_day: input.statementDay,
        due_day: input.dueDay,
        annual_interest_rate: input.annualInterestRate,
        owner_id: input.ownerId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards', householdId] }),
  })
}

export function useUpdateCard(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      credit_limit?: number
      statement_day?: number
      due_day?: number
      annual_interest_rate?: number
      owner_id?: string | null
      archived?: boolean
    }) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('cards').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards', householdId] }),
  })
}
