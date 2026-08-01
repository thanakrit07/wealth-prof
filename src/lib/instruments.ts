import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export type InstrumentKind = 'account' | 'card'

const TABLE: Record<InstrumentKind, string> = { account: 'accounts', card: 'cards' }

export interface InstrumentUsage {
  transactions: number
  /** Rules and installments block deletion — see useDeleteInstrument. */
  recurringRules: number
  installments: number
}

/**
 * What still points at this account/card, so the delete dialog can state the
 * consequences instead of guessing. Only fetched while the dialog is open.
 */
export function useInstrumentUsage(kind: InstrumentKind, id: string | null) {
  return useQuery({
    queryKey: ['instrument-usage', kind, id],
    enabled: id != null,
    queryFn: async (): Promise<InstrumentUsage> => {
      const from = kind === 'account' ? 'from_account_id' : 'from_card_id'
      const to = kind === 'account' ? 'to_account_id' : 'to_card_id'
      const filter = `${from}.eq.${id},${to}.eq.${id}`

      const [txns, rules, insts] = await Promise.all([
        supabase.from('transactions').select('id', { count: 'exact', head: true }).is('deleted_at', null).or(filter),
        supabase.from('recurring_rules').select('id', { count: 'exact', head: true }).is('deleted_at', null).or(filter),
        supabase
          .from('installments')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq(kind === 'account' ? 'account_id' : 'card_id', id),
      ])
      for (const r of [txns, rules, insts]) if (r.error) throw r.error

      return {
        transactions: txns.count ?? 0,
        recurringRules: rules.count ?? 0,
        installments: insts.count ?? 0,
      }
    },
  })
}

/** True when something schedule-driven still points at the instrument. */
export function isInstrumentBlocked(usage: InstrumentUsage): boolean {
  return usage.recurringRules > 0 || usage.installments > 0
}

/**
 * Soft-deletes an account or card, optionally taking its transactions with it.
 *
 * Recurring rules and installments **block** the delete rather than being
 * swept along: both keep generating transactions on a schedule, so a deleted
 * instrument would quietly accumulate new rows pointing at nothing, and
 * removing someone's salary rule as a side effect of tidying an account is
 * more destruction than the action promises. The caller shows what to fix.
 *
 * Everything here is `deleted_at`, never a real DELETE, so a mistake is
 * recoverable in the database (principle 4).
 */
export function useDeleteInstrument(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      kind,
      id,
      withTransactions,
      usage,
    }: {
      kind: InstrumentKind
      id: string
      withTransactions: boolean
      usage: InstrumentUsage
    }) => {
      // The dialog already refuses in this case; this is the backstop.
      if (isInstrumentBlocked(usage)) throw new Error('Still used by a recurring rule or installment')

      const now = new Date().toISOString()
      if (withTransactions) {
        const from = kind === 'account' ? 'from_account_id' : 'from_card_id'
        const to = kind === 'account' ? 'to_account_id' : 'to_card_id'
        const { error } = await supabase
          .from('transactions')
          .update({ deleted_at: now })
          .is('deleted_at', null)
          .or(`${from}.eq.${id},${to}.eq.${id}`)
        if (error) throw error
      }

      const { error } = await supabase.from(TABLE[kind]).update({ deleted_at: now }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', householdId] })
      queryClient.invalidateQueries({ queryKey: ['cards', householdId] })
      queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      queryClient.invalidateQueries({ queryKey: ['instrument-names', householdId] })
    },
  })
}

export interface InstrumentName {
  id: string
  name: string
}

/**
 * Account and card names **including soft-deleted ones**, for labelling
 * historical transactions. Kept separate from useAccounts/useCards, which
 * feed the pickers and must not offer a deleted instrument for new entries:
 * deleting an account you no longer hold shouldn't turn every past expense
 * from it into an anonymous "Account".
 */
export function useInstrumentNames(householdId: string) {
  return useQuery({
    queryKey: ['instrument-names', householdId],
    queryFn: async () => {
      const [accounts, cards] = await Promise.all([
        supabase.from('accounts').select('id, name').eq('household_id', householdId),
        supabase.from('cards').select('id, name').eq('household_id', householdId),
      ])
      if (accounts.error) throw accounts.error
      if (cards.error) throw cards.error

      const map: Record<string, string> = {}
      for (const a of accounts.data as InstrumentName[]) map[`account:${a.id}`] = a.name
      for (const c of cards.data as InstrumentName[]) map[`card:${c.id}`] = c.name
      return map
    },
    staleTime: 60_000,
  })
}
