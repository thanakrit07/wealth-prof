import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { invalidateShareQueries, syncTransactionShares, type ShareRow } from './transactionShares'
import type { TransactionKind } from './transactions'

// D22 / ADR-0015. A Receipt is one payment that covered more than one
// Category. It holds no money: its total, date and instrument are read back
// from the transactions carrying its id, which is why every figure in the app
// can keep summing a flat list of transactions and stay right without knowing
// receipts exist.
export interface Receipt {
  id: string
  household_id: string
  label: string
}

export interface ReceiptLineInput {
  categoryId: string
  amount: number
  description: string
  /**
   * Who bears this line. Written after the split, per line — the receipt
   * itself stores no ratio, because it generates nothing after its form
   * closes and a stored one could only go stale (ADR-0015).
   */
  shares: ShareRow[]
}

export function useReceipts(householdId: string) {
  return useQuery({
    queryKey: ['receipts', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_receipts')
        .select('id, household_id, label')
        .eq('household_id', householdId)
      if (error) throw error
      return data as Receipt[]
    },
  })
}

interface SplitResult {
  receipt_id: string
  transaction_ids: string[]
}

/**
 * Turns an already-recorded transaction into a Receipt. The RPC does the whole
 * conversion in one Postgres transaction — the deferred sum check (0022) is
 * what lets the original's shares be cleared and its amount reduced without an
 * intermediate state ever being judged — and hands back the line ids in the
 * order they were given, so each line's own Split lands on the right row.
 */
export function useSplitIntoReceipt(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      transactionId,
      label,
      kind,
      lines,
    }: {
      transactionId: string
      label: string
      kind: TransactionKind
      lines: ReceiptLineInput[]
    }) => {
      const { data, error } = await supabase.rpc('split_transaction_into_receipt', {
        p_transaction_id: transactionId,
        p_label: label,
        p_lines: lines.map((l) => ({
          category_id: l.categoryId,
          amount: l.amount,
          description: l.description,
        })),
      })
      if (error) throw error
      const result = data as SplitResult

      for (const [i, line] of lines.entries()) {
        const id = result.transaction_ids[i]
        if (!id) continue
        await syncTransactionShares({
          householdId,
          transactionId: id,
          // Income is never split (ADR-0002) — computeShareRows returns no
          // rows for it, which clears the line's shares rather than inventing
          // any.
          kind,
          ownerId: null,
          frontingMemberId: null,
          amount: line.amount,
          memberIds: [],
          custom: line.shares,
        })
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      queryClient.invalidateQueries({ queryKey: ['receipts', householdId] })
      invalidateShareQueries(queryClient, householdId)
    },
  })
}

/**
 * All of a receipt's lines or none of them (ADR-0015). The RPC refuses and
 * names the line when one of them has already been settled up, rather than
 * removing what it can and leaving a remnant.
 */
export function useDeleteReceipt(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { error } = await supabase.rpc('delete_receipt', { p_receipt_id: receiptId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      invalidateShareQueries(queryClient, householdId)
    },
  })
}

export function useRestoreReceipt(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { error } = await supabase.rpc('restore_receipt', { p_receipt_id: receiptId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      invalidateShareQueries(queryClient, householdId)
    },
  })
}
