import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export type CategoryKind = 'income' | 'expense'

export interface Category {
  id: string
  household_id: string
  name: string
  kind: CategoryKind
  icon: string | null
  sort_order: number
  archived: boolean
}

export function useCategories(householdId: string) {
  return useQuery({
    queryKey: ['categories', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_categories')
        .select('id, household_id, name, kind, icon, sort_order, archived')
        .eq('household_id', householdId)
        .order('kind')
        .order('sort_order')
      if (error) throw error
      return data as Category[]
    },
  })
}

export function useCreateCategory(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; kind: CategoryKind; icon: string | null; sortOrder: number }) => {
      const { error } = await supabase.from('categories').insert({
        household_id: householdId,
        name: input.name,
        kind: input.kind,
        icon: input.icon,
        sort_order: input.sortOrder,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  })
}

export function useUpdateCategory(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; icon?: string | null; archived?: boolean; sort_order?: number }) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('categories').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  })
}

export async function swapCategorySortOrder(a: Category, b: Category) {
  await Promise.all([
    supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id),
    supabase.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id),
  ])
}
