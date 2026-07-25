import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { HouseholdMember } from './household'

interface HouseholdContextValue {
  householdId: string
  self: HouseholdMember
  members: HouseholdMember[]
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({
  self,
  children,
}: {
  self: HouseholdMember
  children: ReactNode
}) {
  const { data: members } = useQuery({
    queryKey: ['household_members', self.household_id],
    queryFn: async () => {
      // Excludes pending invites (user_id is null until accepted) — this
      // list drives person filter chips and owner pickers, which only make
      // sense for people who've actually joined. See usePendingInvites for
      // the Settings-only invite management view.
      const { data, error } = await supabase
        .from('household_members')
        .select('id, household_id, user_id, display_name, color')
        .eq('household_id', self.household_id)
        .not('user_id', 'is', null)
        .order('created_at')
      if (error) throw error
      return data as HouseholdMember[]
    },
    // initialData shows something instantly (no flicker on first render),
    // but initialDataUpdatedAt: 0 marks it stale immediately — otherwise
    // the global 30s staleTime (queryClient.ts) treats this seed value as
    // fresh and suppresses the real fetch, so a second member (e.g. a
    // partner who just accepted an invite) wouldn't appear for up to 30s.
    initialData: [self],
    initialDataUpdatedAt: 0,
  })

  return (
    <HouseholdContext.Provider value={{ householdId: self.household_id, self, members: members ?? [self] }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within a HouseholdProvider')
  return ctx
}
