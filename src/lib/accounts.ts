import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { newestAnchor, type AccountAnchorLike } from './finance/balances.ts'
import { supabase } from './supabase'

export type AccountType = 'bank' | 'cash' | 'ewallet'

export interface Account {
  id: string
  household_id: string
  name: string
  type: AccountType
  owner_id: string | null
  // Sourced from the account's newest anchor if it has one — accountBalance
  // itself is unchanged, only where these two numbers come from. New
  // accounts never get an anchor row (balanceAdjustments.ts handles their
  // balance going forward); this stays populated only for accounts that
  // already had anchor history before that changed.
  anchor_balance: number
  anchor_date: string
  // The date of that anchor's reading, if any. No longer meaningful for
  // staleness now that a Balance Adjustment is a normal, dated Transaction —
  // kept for accounts with old anchor history that predates that.
  last_confirmed_date: string | null
  sort_order: number
  archived: boolean
}

export interface AccountAnchor extends AccountAnchorLike {
  id: string
  household_id: string
  note: string | null
}

export function useAccountAnchors(householdId: string) {
  return useQuery({
    queryKey: ['account-anchors', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_account_anchors')
        .select('id, household_id, account_id, reading_balance, reading_date, baseline_balance, baseline_date, note, created_at')
        .eq('household_id', householdId)
      if (error) throw error
      return data as AccountAnchor[]
    },
  })
}

export function useAccounts(householdId: string) {
  const accounts = useQuery({
    queryKey: ['accounts', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_accounts')
        .select('id, household_id, name, type, owner_id, sort_order, archived')
        .eq('household_id', householdId)
        .order('sort_order')
      if (error) throw error
      return data as Omit<Account, 'anchor_balance' | 'anchor_date' | 'last_confirmed_date'>[]
    },
  })
  const anchors = useAccountAnchors(householdId)

  const data = useMemo<Account[] | undefined>(() => {
    if (!accounts.data || !anchors.data) return undefined
    return accounts.data.map((account) => {
      const anchor = newestAnchor(anchors.data, account.id)
      return {
        ...account,
        anchor_balance: anchor?.baseline_balance ?? 0,
        // Every account gets an anchor at creation and the migration
        // backfilled every pre-existing one, so `anchor` is never really
        // null — this sentinel only matters if that invariant is ever
        // broken, and a date far enough in the past treats every real
        // transaction as after-anchor rather than silently excluding them.
        anchor_date: anchor?.baseline_date ?? '1970-01-01',
        last_confirmed_date: anchor?.reading_date ?? null,
      }
    })
  }, [accounts.data, anchors.data])

  return { ...accounts, data }
}

// Balance Adjustments (balanceAdjustments.ts) superseded this as the way an
// account's balance moves after creation — a real Transaction now carries
// what an appended anchor used to. A brand-new account is created with no
// anchor at all; `useAccounts` below already treats "no anchor" as balance
// zero since the beginning of time, which is exactly what an empty account
// is, so its opening balance (if any) is just its first Balance Adjustment.
export function useCreateAccount(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; type: AccountType; ownerId: string | null }) => {
      const { data, error } = await supabase
        .from('accounts')
        .insert({ household_id: householdId, name: input.name, type: input.type, owner_id: input.ownerId })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
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
      archived?: boolean
    }) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('accounts').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', householdId] }),
  })
}
