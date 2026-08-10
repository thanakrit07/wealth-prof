import type { Category, CategoryKind } from './categories'

// Reconcile asks "is this really an income/expense?" (see AccountsScreen).
// Answering yes files the difference under the household's ordinary "Other"
// category, so it reads like any other transaction; answering no files it
// under "Modified Bal" — a category that exists in every household (0028)
// specifically to be excluded from the picker, Records and every rollup.
// "Other" is matched by name because, unlike Modified Bal, nothing marks it
// as special — every household seeded via create_household has one verbatim
// per kind. Returns null only if a household's categories haven't loaded
// yet or were hand-edited to remove one of these.
export function adjustmentCategory(categories: Category[], kind: CategoryKind, visible: boolean): Category | null {
  if (visible) return categories.find((c) => c.kind === kind && c.name === 'Other' && !c.system) ?? null
  return categories.find((c) => c.kind === kind && c.system) ?? null
}
