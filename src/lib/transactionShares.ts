import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Instrument } from '@/components/InstrumentSelect'
import { supabase } from './supabase'

export interface TransactionShare {
  id: string
  household_id: string
  transaction_id: string
  member_id: string
  share_amount: number
  settled_by_transaction_id: string | null
  created_at: string
}

// One debt between two people, carrying enough of its transaction to list and
// pick items without a second round trip (v_unsettled_shares, migration 0023).
// `debt_kind` is 'split' (a shared expense) or 'borrow' (something personal
// put on someone else's card/account) — the same shape, different story.
export interface UnsettledShare {
  id: string
  household_id: string
  transaction_id: string
  settled_by_transaction_id: string | null
  owes_member_id: string
  owed_member_id: string
  amount: number
  debt_kind: 'split' | 'borrow'
  date: string
  transaction_amount: number
  note: string | null
  description: string
  category_id: string | null
}

// A repayment — really just a `transfer` transaction, read back with the
// debts it covers attached (v_settlements, migration 0023). `id` is that
// transaction's own id: there is no separate settlement record to keep in
// sync with it. `amount` is the cash that actually moved; `gross_amount` is
// everything it cleared; they can only disagree if the transfer was edited
// after the fact.
export interface Settlement {
  id: string
  household_id: string
  settled_on: string
  note: string | null
  created_at: string
  created_by: string | null
  from_member_id: string
  to_member_id: string
  amount: number
  gross_amount: number
  net_cleared: number
  share_count: number
}

const SHARE_KEYS = ['transaction_shares', 'unsettled_shares', 'settlements'] as const

function invalidateShareQueries(queryClient: ReturnType<typeof useQueryClient>, householdId: string) {
  for (const key of SHARE_KEYS) queryClient.invalidateQueries({ queryKey: [key, householdId] })
  // A repayment or an exemption toggle is itself a transactions write, so the
  // ledger and any screen reading it (day totals, card cycles) must refresh.
  queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
}

export function useTransactionShares(householdId: string) {
  return useQuery({
    queryKey: ['transaction_shares', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_transaction_shares')
        .select('id, household_id, transaction_id, member_id, share_amount, settled_by_transaction_id, created_at')
        .eq('household_id', householdId)
      if (error) throw error
      return data as TransactionShare[]
    },
  })
}

export function useUnsettledShares(householdId: string) {
  return useQuery({
    queryKey: ['unsettled_shares', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_unsettled_shares')
        .select(
          'id, household_id, transaction_id, settled_by_transaction_id, owes_member_id, owed_member_id, amount, debt_kind, date, transaction_amount, note, description, category_id',
        )
        .eq('household_id', householdId)
        .order('date', { ascending: false })
      if (error) throw error
      return data as UnsettledShare[]
    },
  })
}

// The log — every repayment, newest first, undoable.
export function useSettlements(householdId: string) {
  return useQuery({
    queryKey: ['settlements', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_settlements')
        .select(
          'id, household_id, settled_on, note, created_at, created_by, from_member_id, to_member_id, amount, gross_amount, net_cleared, share_count',
        )
        .eq('household_id', householdId)
        .order('settled_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Settlement[]
    },
  })
}

// Records a repayment by creating a real transfer transaction and pointing
// the chosen shares at it — the transfer *is* the settlement record, so it
// shows up in the ledger like any other movement of money and there's
// nothing else that could drift from it. `fromMemberId` must be the owner of
// `from` (the transaction's own `owner_id`); the caller works that out from
// whichever side of the selection came out heavier.
export function useRecordRepayment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      shareIds: string[]
      fromMemberId: string
      from: Instrument
      to: Instrument
      amount: number
      date: string
      note: string | null
    }) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          date: input.date,
          kind: 'transfer',
          category_id: null,
          category_kind: null,
          description: '',
          amount: input.amount,
          owner_id: input.fromMemberId,
          from_account_id: input.from.accountId,
          from_card_id: input.from.cardId,
          to_account_id: input.to.accountId,
          to_card_id: input.to.cardId,
          note: input.note,
        })
        .select('id')
        .single()
      if (error) throw error
      const transactionId = data.id as string

      const { error: linkError } = await supabase
        .from('transaction_shares')
        .update({ settled_by_transaction_id: transactionId })
        .in('id', input.shareIds)
      if (linkError) {
        // Leaving the transfer behind would show up in the ledger as a
        // payment that cleared nothing, so undo it rather than half-commit.
        await supabase.from('transactions').delete().eq('id', transactionId)
        throw linkError
      }
      return transactionId
    },
    onSuccess: () => invalidateShareQueries(queryClient, householdId),
  })
}

// Undo: soft-deleting the transfer is enough — v_unsettled_shares ignores a
// settled_by_transaction_id whose transaction is gone, so every share it
// covered goes back to owed on its own.
export function useUndoRepayment(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', transactionId)
      if (error) throw error
    },
    onSuccess: () => invalidateShareQueries(queryClient, householdId),
  })
}

// The escape hatch for a transaction that would otherwise read as a debt —
// e.g. an imported row with no owner recorded, or a borrow the two of them
// have separately decided not to track.
export function useSetDebtExempt(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ transactionId, exempt }: { transactionId: string; exempt: boolean }) => {
      const { error } = await supabase.from('transactions').update({ debt_exempt: exempt }).eq('id', transactionId)
      if (error) throw error
    },
    onSuccess: () => invalidateShareQueries(queryClient, householdId),
  })
}
