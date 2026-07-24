// The person filter chip lives once in the app shell and applies to every
// tab (DESIGN.md §7.1). 'all' = no filter, 'shared' = owner_id is null.
export type PersonFilter = 'all' | 'shared' | string

export function matchesPersonFilter(ownerId: string | null, filter: PersonFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'shared') return ownerId === null
  return ownerId === filter
}
