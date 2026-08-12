import type { ColumnMapping } from './detect'
import { mapRow } from './detect'
import { occurrencesBetween } from '../finance/recurrence'
import { normalizeName } from './values'
import {
  validateAccountRow,
  validateCardRow,
  validateCategoryRow,
  validateInstallmentRow,
  validateRecurringRuleRow,
  validateTransactionRow,
} from './validate'
import {
  editKey,
  emptyContext,
  type DateFormat,
  type EntityKind,
  type ImportContext,
  type ImportIssue,
  type ImportPlan,
  type PlannedRow,
  type RowEdits,
} from './types'
import { FIELD_SPECS } from './fields'

export interface EntityFileInput {
  headers: string[]
  rows: Record<string, string>[]
  mapping: ColumnMapping
}

export type FilesInput = Partial<Record<EntityKind, EntityFileInput>>

function warnDuplicates(entity: EntityKind, rows: PlannedRow<{ name: string }>[], issues: ImportIssue[]) {
  const seen = new Map<string, number>()
  for (const row of rows) {
    if (!row.value) continue
    const key = normalizeName(row.value.name)
    const firstRow = seen.get(key)
    if (firstRow !== undefined) {
      issues.push({
        severity: 'warning',
        entity,
        rowNumber: row.rowNumber,
        field: 'name',
        message: `Duplicate name — also used on row ${firstRow}.`,
      })
    } else {
      seen.set(key, row.rowNumber)
    }
  }
}

// buildPlan is pure: no DB, no Date.now() (today is passed in), no React.
// It processes entities in FK order — categories, accounts, cards,
// installments, recurring rules, transactions — extending `context` with
// each valid row's name as it goes, so a transaction row can reference an
// account the same import just created. Deleting or editing a row (via
// `edits`) changes what later rows resolve against, which is why the whole
// plan is rebuilt on every edit rather than patched incrementally (see
// ImportScreen.tsx).
export function buildPlan(files: FilesInput, edits: RowEdits, baseContext: ImportContext, dateFormat: DateFormat, today: string): ImportPlan {
  const context: ImportContext = {
    categories: [...baseContext.categories],
    accounts: [...baseContext.accounts],
    cards: [...baseContext.cards],
    members: [...baseContext.members],
  }
  const issues: ImportIssue[] = []

  function rowsFor(entity: EntityKind): { rowNumber: number; raw: Record<string, string> }[] {
    const file = files[entity]
    if (!file) return []
    const fields = FIELD_SPECS[entity]
    const out: { rowNumber: number; raw: Record<string, string> }[] = []
    file.rows.forEach((csvRow, i) => {
      const rowNumber = i + 1
      const key = editKey(entity, rowNumber)
      if (edits.deleted.has(key)) return
      const raw = mapRow(csvRow, file.mapping, fields)
      const override = edits.overrides[key]
      if (override) Object.assign(raw, override)
      out.push({ rowNumber, raw })
    })
    return out
  }

  const categories = rowsFor('categories').map(({ rowNumber, raw }) => {
    const { value, issues: rowIssues } = validateCategoryRow(rowNumber, raw, context)
    issues.push(...rowIssues)
    if (value) context.categories.push({ name: value.name, kind: value.kind })
    return { rowNumber, raw, value }
  })
  warnDuplicates('categories', categories, issues)

  const accounts = rowsFor('accounts').map(({ rowNumber, raw }) => {
    const { value, issues: rowIssues } = validateAccountRow(rowNumber, raw, context, dateFormat)
    issues.push(...rowIssues)
    if (value) context.accounts.push({ name: value.name })
    return { rowNumber, raw, value }
  })
  warnDuplicates('accounts', accounts, issues)

  const cards = rowsFor('cards').map(({ rowNumber, raw }) => {
    const { value, issues: rowIssues } = validateCardRow(rowNumber, raw, context)
    issues.push(...rowIssues)
    if (value) context.cards.push({ name: value.name })
    return { rowNumber, raw, value }
  })
  warnDuplicates('cards', cards, issues)

  const installments = rowsFor('installments').map(({ rowNumber, raw }) => {
    const { value, issues: rowIssues } = validateInstallmentRow(rowNumber, raw, context, dateFormat)
    issues.push(...rowIssues)
    return { rowNumber, raw, value }
  })
  warnDuplicates('installments', installments, issues)

  const recurringRules = rowsFor('recurringRules').map(({ rowNumber, raw }) => {
    const { value, issues: rowIssues } = validateRecurringRuleRow(rowNumber, raw, context, dateFormat)
    issues.push(...rowIssues)
    return { rowNumber, raw, value }
  })
  warnDuplicates('recurringRules', recurringRules, issues)

  const transactions = rowsFor('transactions').map(({ rowNumber, raw }) => {
    const { value, issues: rowIssues } = validateTransactionRow(rowNumber, raw, context, dateFormat)
    issues.push(...rowIssues)
    return { rowNumber, raw, value }
  })

  const consequences = buildConsequences({ installments, recurringRules, accounts }, today)

  return { categories, accounts, cards, installments, recurringRules, transactions, issues, consequences }
}

function buildConsequences(
  plan: {
    installments: PlannedRow<{ status: string; totalPeriods: number }>[]
    recurringRules: PlannedRow<{
      freq: 'weekly' | 'monthly' | 'yearly'
      interval: number
      dayOfMonth: number | null
      weekday: number | null
      monthOfYear: number | null
      monthEnd: 'clamp' | 'skip'
      startDate: string
      endDate: string | null
      lastGeneratedDate: string | null
      variableAmount: boolean
    }>[]
    accounts: PlannedRow<{ openingBalance: number | null }>[]
  },
  today: string,
): string[] {
  const out: string[] = []

  const activeInstallments = plan.installments.filter((r) => r.value && r.value.status === 'active').map((r) => r.value!)
  if (activeInstallments.length > 0) {
    const totalPeriods = activeInstallments.reduce((sum, i) => sum + i.totalPeriods, 0)
    out.push(
      `${activeInstallments.length} active installment plan${activeInstallments.length === 1 ? '' : 's'} will post ${totalPeriods} period transaction${totalPeriods === 1 ? '' : 's'} when the app next opens.`,
    )
  }

  const backfillRules = plan.recurringRules.filter((r) => r.value && r.value.lastGeneratedDate === null).map((r) => r.value!)
  if (backfillRules.length > 0) {
    let totalOccurrences = 0
    let variableOccurrences = 0
    for (const rule of backfillRules) {
      const from = rule.startDate
      if (from > today) continue
      const count = occurrencesBetween(
        {
          freq: rule.freq,
          interval: rule.interval,
          day_of_month: rule.dayOfMonth,
          month_of_year: rule.monthOfYear,
          weekday: rule.weekday,
          month_end: rule.monthEnd,
          start_date: rule.startDate,
          end_date: rule.endDate,
          max_occurrences: null,
        },
        from,
        today,
      ).length
      totalOccurrences += count
      if (rule.variableAmount) variableOccurrences += count
    }
    if (totalOccurrences > 0) {
      out.push(
        `${backfillRules.length} recurring rule${backfillRules.length === 1 ? ' has' : 's have'} no last-generated date — the app will backfill ${totalOccurrences} occurrence${totalOccurrences === 1 ? '' : 's'} from their start dates${variableOccurrences > 0 ? `; ${variableOccurrences} will need review (variable amount)` : ''}.`,
      )
    }
  }

  const openingBalances = plan.accounts.filter((r) => r.value && r.value.openingBalance !== null)
  if (openingBalances.length > 0) {
    out.push(
      `${openingBalances.length} account${openingBalances.length === 1 ? '' : 's'} will get an opening-balance Reconcile transaction.`,
    )
  }

  return out
}

export { emptyContext }
