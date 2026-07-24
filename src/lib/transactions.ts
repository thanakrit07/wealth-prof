import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { CategoryKind } from './categories'

export type TransactionKind = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: string
  household_id: string
  date: string
  kind: TransactionKind
  category_id: string | null
  category_kind: CategoryKind | null
  description: string
  amount: number
  owner_id: string | null
  from_account_id: string | null
  from_card_id: string | null
  to_account_id: string | null
  to_card_id: string | null
  note: string | null
  confirmed: boolean
}

export interface TransactionInput {
  date: string
  kind: TransactionKind
  categoryId: string | null
  categoryKind: CategoryKind | null
  description: string
  amount: number
  ownerId: string | null
  fromAccountId: string | null
  fromCardId: string | null
  toAccountId: string | null
  toCardId: string | null
  note: string | null
}

function toRow(householdId: string, input: TransactionInput) {
  return {
    household_id: householdId,
    date: input.date,
    kind: input.kind,
    category_id: input.categoryId,
    category_kind: input.categoryKind,
    description: input.description,
    amount: input.amount,
    owner_id: input.ownerId,
    from_account_id: input.fromAccountId,
    from_card_id: input.fromCardId,
    to_account_id: input.toAccountId,
    to_card_id: input.toCardId,
    note: input.note,
  }
}

export function useTransactions(householdId: string, range: { start: string; end: string }) {
  return useQuery({
    queryKey: ['transactions', householdId, range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_transactions')
        .select(
          'id, household_id, date, kind, category_id, category_kind, description, amount, owner_id, from_account_id, from_card_id, to_account_id, to_card_id, note, confirmed',
        )
        .eq('household_id', householdId)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
  })
}

export function useCreateTransaction(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      const { error } = await supabase.from('transactions').insert(toRow(householdId, input))
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions', householdId] }),
  })
}

export function useUpdateTransaction(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TransactionInput }) => {
      const { error } = await supabase.from('transactions').update(toRow(householdId, input)).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions', householdId] }),
  })
}

export function useDeleteTransaction(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions', householdId] }),
  })
}
