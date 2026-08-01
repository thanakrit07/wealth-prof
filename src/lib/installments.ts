import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export type InstallmentStatus = 'active' | 'done' | 'cancelled'

export interface Installment {
  id: string
  household_id: string
  name: string
  category_id: string | null
  start_date: string
  total_periods: number
  monthly_amount: number
  final_amount: number | null
  card_id: string | null
  account_id: string | null
  annual_interest_rate: number
  is_cash_advance: boolean
  owner_id: string | null
  note: string | null
  status: InstallmentStatus
}

export interface InstallmentPayment {
  id: string
  installment_id: string
  period_no: number
  paid_date: string
  transaction_id: string | null
}

const INSTALLMENT_COLUMNS =
  'id, household_id, name, category_id, start_date, total_periods, monthly_amount, final_amount, card_id, account_id, annual_interest_rate, is_cash_advance, owner_id, note, status'

export function useInstallments(householdId: string) {
  return useQuery({
    queryKey: ['installments', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_installments')
        .select(INSTALLMENT_COLUMNS)
        .eq('household_id', householdId)
        .order('start_date', { ascending: false })
      if (error) throw error
      return data as Installment[]
    },
  })
}

export function useInstallmentPayments(householdId: string) {
  return useQuery({
    queryKey: ['installment_payments', householdId],
    queryFn: async () => {
      // installment_payments has no household_id filter needed at the app
      // layer since RLS already scopes it, but we still join through
      // installments to keep the query shape simple for the client.
      const { data, error } = await supabase
        .from('installment_payments')
        .select('id, installment_id, period_no, paid_date, transaction_id')
      if (error) throw error
      return data as InstallmentPayment[]
    },
  })
}

export type InstallmentInput = Omit<Installment, 'id' | 'household_id'>

export function useCreateInstallment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: InstallmentInput) => {
      const { error } = await supabase.from('installments').insert({ household_id: householdId, ...input })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installments', householdId] }),
  })
}

export function useUpdateInstallment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<InstallmentInput> }) => {
      const { error } = await supabase.from('installments').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installments', householdId] }),
  })
}

export function useDeleteInstallment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('installments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['installments', householdId] }),
  })
}

/**
 * Marks the next period paid for an account-billed installment (DESIGN
 * §6.3, §6.7): always creates the paired transaction, so the account
 * balance can never drift from the payment history. Card-billed
 * installments no longer go through this — InstallmentMaterialiser posts
 * their periods automatically on the period date (§6.7 D11), since the
 * charge lands on the real statement whether or not anyone taps anything.
 */
export function useMarkPeriodPaid(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      installment,
      periodNo,
      paidDate,
      ownerId,
    }: {
      installment: Installment
      periodNo: number
      paidDate: string
      ownerId: string | null
    }) => {
      const amount =
        periodNo === installment.total_periods && installment.final_amount != null
          ? installment.final_amount
          : installment.monthly_amount
      const { data: txn, error: txnError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          date: paidDate,
          kind: 'expense',
          category_id: installment.category_id,
          category_kind: installment.category_id ? 'expense' : null,
          description: `${installment.name} (งวดที่ ${periodNo}/${installment.total_periods})`,
          amount,
          owner_id: ownerId,
          from_account_id: installment.account_id,
          source: 'installment',
          // Same key format as the materialiser (installmentMaterialiser.ts)
          // so an early manual payment here is recognised as "already
          // posted" and the materialiser doesn't try to post it again once
          // the period's due date arrives.
          source_key: `installment:${installment.id}:${periodNo}`,
        })
        .select('id')
        .single()
      if (txnError) throw txnError

      const { error } = await supabase.from('installment_payments').insert({
        household_id: householdId,
        installment_id: installment.id,
        period_no: periodNo,
        paid_date: paidDate,
        transaction_id: txn.id,
      })
      if (error) throw error

      if (periodNo === installment.total_periods) {
        await supabase.from('installments').update({ status: 'done' }).eq('id', installment.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', householdId] })
      queryClient.invalidateQueries({ queryKey: ['installment_payments', householdId] })
      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
    },
  })
}

/** Undo the most recent payment (soft delete + detach transaction). */
export function useUndoLastPayment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: InstallmentPayment) => {
      if (payment.transaction_id) {
        await supabase
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', payment.transaction_id)
      }
      const { error } = await supabase.from('installment_payments').delete().eq('id', payment.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', householdId] })
      queryClient.invalidateQueries({ queryKey: ['installment_payments', householdId] })
      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
    },
  })
}
