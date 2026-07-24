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
      const { data, error } = await supabase
        .from('household_members')
        .select('id, household_id, user_id, display_name, color')
        .eq('household_id', self.household_id)
        .order('created_at')
      if (error) throw error
      return data as HouseholdMember[]
    },
    initialData: [self],
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
