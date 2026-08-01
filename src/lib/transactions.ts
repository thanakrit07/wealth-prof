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
  source: string
  source_key: string | null
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
          'id, household_id, date, kind, category_id, category_kind, description, amount, owner_id, from_account_id, from_card_id, to_account_id, to_card_id, note, confirmed, source, source_key',
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
    // Returns the new row's id so the caller can offer undo (soft delete).
    mutationFn: async (input: TransactionInput) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert(toRow(householdId, input))
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions', householdId] }),
  })
}

export function useUpdateTransaction(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // `confirm: true` additionally marks a generated (unconfirmed) row as
    // reviewed — editing an amount in the review strip confirms it (§6.6).
    mutationFn: async ({ id, input, confirm }: { id: string; input: TransactionInput; confirm?: boolean }) => {
      const row = { ...toRow(householdId, input), ...(confirm ? { confirmed: true } : {}) }
      const { error } = await supabase.from('transactions').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions', householdId] }),
  })
}

// Generated rows awaiting review (§6.6) — not limited to the visible
// month, so a missed review from last month still surfaces.
export function useUnconfirmedTransactions(householdId: string) {
  return useQuery({
    queryKey: ['transactions', householdId, 'unconfirmed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_transactions')
        .select(
          'id, household_id, date, kind, category_id, category_kind, description, amount, owner_id, from_account_id, from_card_id, to_account_id, to_card_id, note, confirmed, source, source_key',
        )
        .eq('household_id', householdId)
        .eq('confirmed', false)
        .order('date')
      if (error) throw error
      return data as Transaction[]
    },
  })
}

const UNIQUE_VIOLATION = '23505'

export function useConfirmTransaction(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (transaction: Transaction) => {
      const { error } = await supabase.from('transactions').update({ confirmed: true }).eq('id', transaction.id)
      if (error) throw error

      // Account-billed installment periods only become a "paid" event once
      // reviewed here (DESIGN §4.5/§6.7) — card-billed periods already wrote
      // their installment_payments row when the materialiser posted them.
      if (transaction.source === 'installment' && transaction.source_key) {
        const [, installmentId, periodNoStr] = transaction.source_key.split(':')
        const periodNo = Number(periodNoStr)

        const { error: paymentError } = await supabase.from('installment_payments').insert({
          household_id: householdId,
          installment_id: installmentId,
          period_no: periodNo,
          paid_date: transaction.date,
          transaction_id: transaction.id,
        })
        if (paymentError && paymentError.code !== UNIQUE_VIOLATION) throw paymentError

        const { data: inst } = await supabase
          .from('installments')
          .select('total_periods')
          .eq('id', installmentId)
          .single()
        if (inst && periodNo >= inst.total_periods) {
          await supabase.from('installments').update({ status: 'done' }).eq('id', installmentId)
        }

        queryClient.invalidateQueries({ queryKey: ['installments', householdId] })
        queryClient.invalidateQueries({ queryKey: ['installment_payments', householdId] })
      }
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
