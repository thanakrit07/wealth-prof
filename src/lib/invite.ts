import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { HouseholdMember } from './household'

export interface PendingInvite {
  id: string
  display_name: string
  invite_code: string
}

export function usePendingInvites(householdId: string) {
  return useQuery({
    queryKey: ['pending_invites', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('id, display_name, invite_code')
        .eq('household_id', householdId)
        .is('user_id', null)
      if (error) throw error
      return data as PendingInvite[]
    },
  })
}

export function useGenerateInvite(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (displayName: string) => {
      const { data, error } = await supabase.rpc('generate_invite_code', { p_display_name: displayName })
      if (error) throw error
      return data as PendingInvite
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending_invites', householdId] }),
  })
}

export function useRevokeInvite(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('revoke_invite', { p_member_id: memberId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending_invites', householdId] }),
  })
}

// Mirrors createHouseholdForUser (household.ts) but claims an existing
// invited placeholder row instead of creating a new household.
export async function joinHouseholdWithCode(inviteCode: string, displayName: string): Promise<HouseholdMember> {
  const { data, error } = await supabase.rpc('join_household', {
    p_invite_code: inviteCode,
    p_display_name: displayName,
  })
  if (error) throw error
  return data as HouseholdMember
}
