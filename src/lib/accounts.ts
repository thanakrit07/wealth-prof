import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export type AccountType = 'bank' | 'cash' | 'ewallet'

export interface Account {
  id: string
  household_id: string
  name: string
  type: AccountType
  owner_id: string | null
  anchor_balance: number
  anchor_date: string
  sort_order: number
  archived: boolean
}

export function useAccounts(householdId: string) {
  return useQuery({
    queryKey: ['accounts', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_accounts')
        .select('id, household_id, name, type, owner_id, anchor_balance, anchor_date, sort_order, archived')
        .eq('household_id', householdId)
        .order('sort_order')
      if (error) throw error
      return data as Account[]
    },
  })
}

export function useCreateAccount(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      type: AccountType
      ownerId: string | null
      anchorBalance: number
      anchorDate: string
    }) => {
      const { error } = await supabase.from('accounts').insert({
        household_id: householdId,
        name: input.name,
        type: input.type,
        owner_id: input.ownerId,
        anchor_balance: input.anchorBalance,
        anchor_date: input.anchorDate,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', householdId] }),
  })
}

export function useUpdateAccount(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      type?: AccountType
      owner_id?: string | null
      anchor_balance?: number
      anchor_date?: string
      archived?: boolean
    }) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('accounts').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', householdId] }),
  })
}
