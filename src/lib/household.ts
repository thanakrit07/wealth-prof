import { supabase } from './supabase'

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  display_name: string
  color: string
}

// A signed-in user has no row here until they either create a household
// (first person) or accept an invite (phase 1). Returns null, not an error,
// when setup has not happened yet — callers decide what to show.
export async function fetchOwnMember(userId: string): Promise<HouseholdMember | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, user_id, display_name, color')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

// First-run bootstrap (DESIGN.md §5): the first person to sign up creates
// the household. Inviting a second person into an existing household is
// phase 1 scope. Goes through the create_household RPC, not a plain insert:
// the households RLS policy requires id = current_household_id(), which is
// null until household_members has a row for this user — a plain insert
// would be rejected by its own WITH CHECK clause.
export async function createHouseholdForUser(displayName: string): Promise<HouseholdMember> {
  const { data, error } = await supabase.rpc('create_household', {
    p_display_name: displayName,
  })
  if (error) throw error
  return data as HouseholdMember
}
