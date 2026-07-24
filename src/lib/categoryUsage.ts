import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { supabase } from './supabase'

export interface CategoryUsage {
  counts: Map<string, number>
  lastInstrument: Map<string, { accountId: string | null; cardId: string | null }>
}

// DESIGN.md §7.2: the quick-add category grid is ordered by frequency of
// use, and the account/card defaults to the one last used with the chosen
// category. Both are derived from the last 90 days of transactions.
export function useCategoryUsage(householdId: string) {
  return useQuery({
    queryKey: ['category-usage', householdId],
    queryFn: async (): Promise<CategoryUsage> => {
      const since = format(subDays(new Date(), 90), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('v_transactions')
        .select('category_id, from_account_id, from_card_id')
        .eq('household_id', householdId)
        .not('category_id', 'is', null)
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(1000)
      if (error) throw error

      const counts = new Map<string, number>()
      const lastInstrument = new Map<string, { accountId: string | null; cardId: string | null }>()
      for (const row of data) {
        const id = row.category_id as string
        counts.set(id, (counts.get(id) ?? 0) + 1)
        // Rows are newest-first, so the first row seen per category is the
        // most recently used instrument for it.
        if (!lastInstrument.has(id)) {
          lastInstrument.set(id, { accountId: row.from_account_id, cardId: row.from_card_id })
        }
      }
      return { counts, lastInstrument }
    },
    staleTime: 60_000,
  })
}
