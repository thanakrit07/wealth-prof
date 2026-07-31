import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { supabase } from './supabase'

interface Instrument {
  accountId: string | null
  cardId: string | null
}

/**
 * What the query stores. Plain objects, not Maps: query data is persisted to
 * localStorage via JSON (see queryClient.ts), and `JSON.stringify(new Map())`
 * is `{}` — the entries are silently dropped and the rehydrated value has no
 * `.get`. **Everything a queryFn returns must survive a JSON round-trip.**
 */
export interface CategoryUsageData {
  counts: Record<string, number>
  lastInstrument: Record<string, Instrument>
}

/** What callers get — Maps, rebuilt per observer by `select` (never persisted). */
export interface CategoryUsage {
  counts: Map<string, number>
  lastInstrument: Map<string, Instrument>
}

// Module scope so the identity is stable across renders; React Query skips
// re-running select when neither the data nor the function changed.
export function toMaps(data: CategoryUsageData): CategoryUsage {
  return {
    counts: new Map(Object.entries(data.counts)),
    lastInstrument: new Map(Object.entries(data.lastInstrument)),
  }
}

// DESIGN.md §7.2: the quick-add category grid is ordered by frequency of
// use, and the account/card defaults to the one last used with the chosen
// category. Both are derived from the last 90 days of transactions.
export function useCategoryUsage(householdId: string) {
  return useQuery({
    queryKey: ['category-usage', householdId],
    select: toMaps,
    queryFn: async (): Promise<CategoryUsageData> => {
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

      const counts: Record<string, number> = {}
      const lastInstrument: Record<string, Instrument> = {}
      for (const row of data) {
        const id = row.category_id as string
        counts[id] = (counts[id] ?? 0) + 1
        // Rows are newest-first, so the first row seen per category is the
        // most recently used instrument for it.
        if (!(id in lastInstrument)) {
          lastInstrument[id] = { accountId: row.from_account_id, cardId: row.from_card_id }
        }
      }
      return { counts, lastInstrument }
    },
    staleTime: 60_000,
  })
}
