// Bulk CSV import (redesign, replacing scripts/import-sheet.ts). See the ADR
// for why: in-app instead of a script, insert-only instead of upsert, and no
// heuristics — the household shapes the sheet to a template instead of the
// importer guessing at theirs.

export type EntityKind = 'categories' | 'accounts' | 'cards' | 'installments' | 'recurringRules' | 'transactions'

export const ENTITY_KINDS: EntityKind[] = ['categories', 'accounts', 'cards', 'installments', 'recurringRules', 'transactions']

export type IssueSeverity = 'error' | 'warning'

export interface ImportIssue {
  severity: IssueSeverity
  entity: EntityKind
  rowNumber: number
  field?: string
  message: string
}

// `value` is null exactly when the row has at least one blocking error —
// `issues` (in ImportPlan) says why. `raw` is the field values after mapping
// and user edits, keyed by FieldSpec.key, kept so the preview table can
// re-render an errored row without re-reading the CSV.
export interface PlannedRow<T> {
  rowNumber: number
  raw: Record<string, string>
  value: T | null
}

// A cell's edit key — one string so RowEdits doesn't need a nested Map per
// entity. Deleting a row removes it from the plan AND from the name index
// other rows resolve against, so edits are threaded through buildPlan again
// on every change rather than patched in place (see plan.ts).
export function editKey(entity: EntityKind, rowNumber: number): string {
  return `${entity}:${rowNumber}`
}

export interface RowEdits {
  overrides: Record<string, Record<string, string>>
  deleted: Set<string>
}

export function emptyRowEdits(): RowEdits {
  return { overrides: {}, deleted: new Set() }
}

export type DateFormat = 'dmy' | 'mdy' | 'ymd'

// --- Resolved shapes per entity — what a valid row becomes. Every
// cross-entity reference is a name (resolved against ImportContext in
// validate.ts), never an id, because ids don't exist in a spreadsheet. ---

export interface PlannedCategory {
  name: string
  kind: 'income' | 'expense'
  parentName: string | null
  icon: string | null
  color: string | null
}

export interface PlannedAccount {
  name: string
  type: 'bank' | 'cash' | 'ewallet'
  ownerName: string | null
  openingBalance: number | null
  openingAsOf: string | null
}

export interface PlannedCard {
  name: string
  creditLimit: number
  statementDay: number
  dueDay: number
  annualInterestRate: number
  ownerName: string | null
}

export interface PlannedInstallment {
  name: string
  startDate: string
  totalPeriods: number
  monthlyAmount: number
  finalAmount: number | null
  categoryName: string
  instrumentName: string
  annualInterestRate: number
  isCashAdvance: boolean
  ownerName: string | null
  note: string | null
  status: 'active' | 'done' | 'cancelled'
  periodsPaid: number
}

export interface PlannedRecurringRule {
  name: string
  kind: 'income' | 'expense' | 'transfer'
  amount: number
  categoryName: string | null
  freq: 'weekly' | 'monthly' | 'yearly'
  interval: number
  dayOfMonth: number | null
  weekday: number | null
  monthOfYear: number | null
  monthEnd: 'clamp' | 'skip'
  startDate: string
  endDate: string | null
  instrumentName: string
  toInstrumentName: string | null
  autoPost: boolean
  variableAmount: boolean
  lastGeneratedDate: string | null
  ownerName: string | null
  note: string | null
  active: boolean
}

export interface PlannedTransaction {
  date: string
  kind: 'income' | 'expense' | 'transfer'
  amount: number
  categoryName: string | null
  instrumentName: string
  toInstrumentName: string | null
  note: string | null
  description: string
  ownerName: string | null
}

export interface ImportPlan {
  categories: PlannedRow<PlannedCategory>[]
  accounts: PlannedRow<PlannedAccount>[]
  cards: PlannedRow<PlannedCard>[]
  installments: PlannedRow<PlannedInstallment>[]
  recurringRules: PlannedRow<PlannedRecurringRule>[]
  transactions: PlannedRow<PlannedTransaction>[]
  issues: ImportIssue[]
  consequences: string[]
}

// What buildPlan resolves names against: the household's existing rows, as
// of when the import screen opened. Names created earlier in the SAME run
// (a new account referenced by a transaction row) are added on top of this
// as plan.ts works through the entities in FK order — see plan.ts.
export interface ImportContext {
  categories: { name: string; kind: 'income' | 'expense' }[]
  accounts: { name: string }[]
  cards: { name: string }[]
  members: { name: string }[]
}

export function emptyContext(): ImportContext {
  return { categories: [], accounts: [], cards: [], members: [] }
}
