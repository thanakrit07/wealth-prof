import { describe, expect, it } from 'vitest'
import { buildPlan, type FilesInput } from './plan'
import { emptyContext, emptyRowEdits, type ImportContext, type RowEdits } from './types'

const ctx: ImportContext = emptyContext()

function file(headers: string[], rows: string[][]): { headers: string[]; rows: Record<string, string>[]; mapping: Record<string, string | null> } {
  const dataRows = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  const mapping = Object.fromEntries(headers.map((h) => [h, h])) // key == header, identity mapping for these tests
  return { headers, rows: dataRows, mapping }
}

describe('buildPlan — cross-file name resolution', () => {
  it('lets a transaction reference an account created earlier in the same run', () => {
    const files: FilesInput = {
      accounts: file(['name', 'type', 'owner', 'openingBalance', 'openingAsOf'], [['Bank — Earth', 'bank', '', '', '']]),
      categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Groceries', 'expense', '', '', '']]),
      transactions: file(
        ['date', 'kind', 'amount', 'category', 'instrument', 'toInstrument', 'note', 'description', 'owner'],
        [['03/01/2026', 'expense', '250', 'Groceries', 'Bank — Earth', '', 'Coffee', '', '']],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.transactions[0].value).not.toBeNull()
    expect(plan.transactions[0].value?.instrumentName).toBe('Bank — Earth')
    expect(plan.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('fails a transaction that references an account not created and not in the existing household', () => {
    const files: FilesInput = {
      categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Groceries', 'expense', '', '', '']]),
      transactions: file(
        ['date', 'kind', 'amount', 'category', 'instrument', 'toInstrument', 'note', 'description', 'owner'],
        [['03/01/2026', 'expense', '250', 'Groceries', 'Nonexistent', '', '', '', '']],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.transactions[0].value).toBeNull()
    expect(plan.issues.some((i) => i.field === 'instrument')).toBe(true)
  })

  it('resolves against the existing household context, not just this run', () => {
    const withExisting: ImportContext = { ...emptyContext(), accounts: [{ name: 'Bank — Earth' }], categories: [{ name: 'Groceries', kind: 'expense' }] }
    const files: FilesInput = {
      transactions: file(
        ['date', 'kind', 'amount', 'category', 'instrument', 'toInstrument', 'note', 'description', 'owner'],
        [['03/01/2026', 'expense', '250', 'Groceries', 'Bank — Earth', '', '', '', '']],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), withExisting, 'dmy', '2026-01-10')
    expect(plan.transactions[0].value).not.toBeNull()
  })
})

describe('buildPlan — row edits', () => {
  const baseFiles: FilesInput = {
    categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Groceries', 'expense', '', '', '']]),
    accounts: file(['name', 'type', 'owner', 'openingBalance', 'openingAsOf'], [['Bank — Earth', 'bank', '', '', '']]),
    transactions: file(
      ['date', 'kind', 'amount', 'category', 'instrument', 'toInstrument', 'note', 'description', 'owner'],
      [
        ['03/01/2026', 'expense', '250', 'Wrong Category', 'Bank — Earth', '', 'Row 1', '', ''],
        ['04/01/2026', 'expense', '100', 'Groceries', 'Bank — Earth', '', 'Row 2', '', ''],
      ],
    ),
  }

  it('an override fixes a row that would otherwise error', () => {
    const before = buildPlan(baseFiles, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(before.transactions[0].value).toBeNull()

    const edits: RowEdits = { overrides: { 'transactions:1': { category: 'Groceries' } }, deleted: new Set() }
    const after = buildPlan(baseFiles, edits, ctx, 'dmy', '2026-01-10')
    expect(after.transactions[0].value).not.toBeNull()
    expect(after.transactions[0].value?.categoryName).toBe('Groceries')
    // The other row is untouched by an edit that names it specifically.
    expect(after.transactions[1].value).not.toBeNull()
  })

  it('a deleted row disappears from the plan entirely', () => {
    const edits: RowEdits = { overrides: {}, deleted: new Set(['transactions:2']) }
    const plan = buildPlan(baseFiles, edits, ctx, 'dmy', '2026-01-10')
    expect(plan.transactions).toHaveLength(1)
    expect(plan.transactions[0].rowNumber).toBe(1)
  })

  it('deleting a row that other rows reference makes those rows error', () => {
    const files: FilesInput = {
      categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Groceries', 'expense', '', '', '']]),
      accounts: file(['name', 'type', 'owner', 'openingBalance', 'openingAsOf'], [['Bank — Earth', 'bank', '', '', '']]),
      transactions: file(
        ['date', 'kind', 'amount', 'category', 'instrument', 'toInstrument', 'note', 'description', 'owner'],
        [['03/01/2026', 'expense', '250', 'Groceries', 'Bank — Earth', '', '', '', '']],
      ),
    }
    const withoutDeletion = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(withoutDeletion.transactions[0].value).not.toBeNull()

    const edits: RowEdits = { overrides: {}, deleted: new Set(['accounts:1']) }
    const withDeletion = buildPlan(files, edits, ctx, 'dmy', '2026-01-10')
    expect(withDeletion.transactions[0].value).toBeNull()
    expect(withDeletion.issues.some((i) => i.entity === 'transactions' && i.field === 'instrument')).toBe(true)
  })
})

describe('buildPlan — duplicate name warnings', () => {
  it('warns, but does not block, a duplicate account name', () => {
    const files: FilesInput = {
      accounts: file(
        ['name', 'type', 'owner', 'openingBalance', 'openingAsOf'],
        [
          ['Bank — Earth', 'bank', '', '', ''],
          ['Bank — Earth', 'cash', '', '', ''],
        ],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.accounts[0].value).not.toBeNull()
    expect(plan.accounts[1].value).not.toBeNull()
    const dup = plan.issues.find((i) => i.entity === 'accounts' && i.rowNumber === 2)
    expect(dup?.severity).toBe('warning')
  })
})

describe('buildPlan — duplicate detection is per identity, not per name', () => {
  it('does not flag the same category name under two different kinds', () => {
    // create_household seeds "Other" for both kinds, so this pair is
    // legitimate — keying the duplicate check on the name alone flagged it.
    const files: FilesInput = {
      categories: file(
        ['name', 'kind', 'parent', 'icon', 'color'],
        [
          ['Other', 'expense', '', '', ''],
          ['Other', 'income', '', '', ''],
        ],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.issues).toEqual([])
    expect(plan.categories.every((r) => r.value !== null)).toBe(true)
  })

  it('still flags the same category name repeated under the same kind', () => {
    const files: FilesInput = {
      categories: file(
        ['name', 'kind', 'parent', 'icon', 'color'],
        [
          ['Other', 'expense', '', '', ''],
          ['Other', 'expense', '', '', ''],
        ],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.issues.map((i) => [i.severity, i.rowNumber])).toEqual([['warning', 2]])
  })
})

describe('buildPlan — consequences', () => {
  it('reports installment periods that will post', () => {
    const files: FilesInput = {
      categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Electronics', 'expense', '', '', '']]),
      cards: file(
        ['name', 'creditLimit', 'statementDay', 'dueDay', 'annualInterestRate', 'owner'],
        [['Card •• 1234', '50000', '20', '5', '', '']],
      ),
      installments: file(
        [
          'name',
          'startDate',
          'totalPeriods',
          'monthlyAmount',
          'finalAmount',
          'category',
          'instrument',
          'annualInterestRate',
          'isCashAdvance',
          'owner',
          'note',
          'status',
          'periodsPaid',
        ],
        [['Laptop', '15/01/2026', '10', '1500', '', 'Electronics', 'Card •• 1234', '', '', '', '', '', '']],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.installments[0].value).not.toBeNull()
    expect(plan.consequences.some((c) => c.includes('10 period'))).toBe(true)
  })

  it('reports recurring backfill occurrences when last_generated_date is blank', () => {
    const files: FilesInput = {
      categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Subscriptions', 'expense', '', '', '']]),
      cards: file(
        ['name', 'creditLimit', 'statementDay', 'dueDay', 'annualInterestRate', 'owner'],
        [['Card •• 1234', '50000', '20', '5', '', '']],
      ),
      recurringRules: file(
        [
          'name',
          'kind',
          'amount',
          'category',
          'freq',
          'interval',
          'dayOfMonth',
          'weekday',
          'monthOfYear',
          'monthEnd',
          'startDate',
          'endDate',
          'instrument',
          'toInstrument',
          'autoPost',
          'variableAmount',
          'lastGeneratedDate',
          'owner',
          'note',
          'active',
        ],
        [
          [
            'Netflix',
            'expense',
            '350',
            'Subscriptions',
            'monthly',
            '',
            '15',
            '',
            '',
            '',
            '15/01/2026',
            '',
            'Card •• 1234',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ],
        ],
      ),
    }
    // start 2026-01-15, today 2026-04-10 -> Jan 15/Feb 15/Mar 15 occurred; Apr 15 hasn't yet.
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-04-10')
    expect(plan.recurringRules[0].value).not.toBeNull()
    expect(plan.consequences.some((c) => c.includes('3 occurrence'))).toBe(true)
  })

  it('reports accounts that will get an opening-balance Reconcile transaction', () => {
    const files: FilesInput = {
      accounts: file(
        ['name', 'type', 'owner', 'openingBalance', 'openingAsOf'],
        [['Bank — Earth', 'bank', '', '15000', '01/01/2026']],
      ),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.consequences.some((c) => c.includes('opening-balance Reconcile'))).toBe(true)
  })

  it('reports nothing when there is nothing to report', () => {
    const files: FilesInput = {
      categories: file(['name', 'kind', 'parent', 'icon', 'color'], [['Groceries', 'expense', '', '', '']]),
    }
    const plan = buildPlan(files, emptyRowEdits(), ctx, 'dmy', '2026-01-10')
    expect(plan.consequences).toEqual([])
  })
})
