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
  parent_id: string | null
}

export function useCategories(householdId: string) {
  return useQuery({
    queryKey: ['categories', householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_categories')
        .select('id, household_id, name, kind, icon, sort_order, archived, parent_id')
        .eq('household_id', householdId)
        .order('kind')
        .order('sort_order')
      if (error) throw error
      return data as Category[]
    },
  })
}

// DESIGN.md §4.2 (D10): a category with no parent_id is a main; every report
// groups by this effective main, drilling down into subs from there.
export function effectiveMainId(category: Pick<Category, 'id' | 'parent_id'>): string {
  return category.parent_id ?? category.id
}

export function useCreateCategory(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      kind: CategoryKind
      icon: string | null
      sortOrder: number
      parentId?: string | null
    }) => {
      const { error } = await supabase.from('categories').insert({
        household_id: householdId,
        name: input.name,
        kind: input.kind,
        icon: input.icon,
        sort_order: input.sortOrder,
        parent_id: input.parentId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  })
}

export function useUpdateCategory(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      icon?: string | null
      archived?: boolean
      sort_order?: number
      parent_id?: string | null
    }) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('categories').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  })
}

// Persists a full reordering of one sibling group (mains, or one main's
// subs) after a drag — writes each row's new sort_order.
export function useReorderCategories(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: Category[]) => {
      await Promise.all(
        ordered.map((c, i) => supabase.from('categories').update({ sort_order: i }).eq('id', c.id)),
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  })
}

// Hard-deletes an unused category; falls back to archiving (which cascades
// to subs, D10) if it's referenced by any transaction/rule/installment/
// budget, or has sub-categories of its own — relies on the FK RESTRICT
// Postgres already enforces on every category_id/parent_id reference, so
// there's one source of truth for "in use," not four separate count queries.
export function useDeleteCategory(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (category: Category): Promise<'deleted' | 'archived'> => {
      const { error } = await supabase.from('categories').delete().eq('id', category.id)
      if (!error) return 'deleted'
      if (error.code !== '23503') throw error
      const { error: archiveError } = await supabase
        .from('categories')
        .update({ archived: true })
        .eq('id', category.id)
      if (archiveError) throw archiveError
      return 'archived'
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  })
}
