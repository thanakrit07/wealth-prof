import { describe, expect, it } from 'vitest'
import type { ImportContext } from './types'
import {
  validateAccountRow,
  validateCardRow,
  validateCategoryRow,
  validateInstallmentRow,
  validateRecurringRuleRow,
  validateTransactionRow,
} from './validate'

const ctx: ImportContext = {
  categories: [
    { name: 'Groceries', kind: 'expense' },
    { name: 'Salary', kind: 'income' },
    { name: 'Electronics', kind: 'expense' },
  ],
  accounts: [{ name: 'Bank — Earth' }],
  cards: [{ name: 'Card •• 1234' }],
  members: [{ name: 'Earth' }, { name: 'Ploy' }],
}

function hasError(issues: { severity: string; field?: string }[], field: string): boolean {
  return issues.some((i) => i.severity === 'error' && i.field === field)
}

describe('validateCategoryRow', () => {
  it('accepts a valid main category', () => {
    const { value, issues } = validateCategoryRow(1, { name: 'Transport', kind: 'expense', parent: '', icon: '', color: '' }, ctx)
    expect(issues).toEqual([])
    expect(value).toEqual({ name: 'Transport', kind: 'expense', parentName: null, icon: null, color: null })
  })

  it('requires name and kind', () => {
    const { value, issues } = validateCategoryRow(1, { name: '', kind: '', parent: '', icon: '', color: '' }, ctx)
    expect(value).toBeNull()
    expect(hasError(issues, 'name')).toBe(true)
    expect(hasError(issues, 'kind')).toBe(true)
  })

  it('rejects a parent that does not exist under the same kind', () => {
    const { value, issues } = validateCategoryRow(1, { name: 'Coffee', kind: 'expense', parent: 'Salary', icon: '', color: '' }, ctx)
    expect(value).toBeNull()
    expect(hasError(issues, 'parent')).toBe(true)
  })
})

describe('validateAccountRow', () => {
  it('accepts a valid Common Pot (blank owner)', () => {
    const { value, issues } = validateAccountRow(1, { name: 'Joint', type: 'bank', owner: '', openingBalance: '', openingAsOf: '' }, ctx, 'dmy')
    expect(issues).toEqual([])
    expect(value?.ownerName).toBeNull()
  })

  it('rejects an owner that is not a household member', () => {
    const { value, issues } = validateAccountRow(1, { name: 'X', type: 'bank', owner: 'Stranger', openingBalance: '', openingAsOf: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'owner')).toBe(true)
  })

  it('requires opening_as_of when opening_balance is set', () => {
    const { value, issues } = validateAccountRow(1, { name: 'X', type: 'cash', owner: '', openingBalance: '1000', openingAsOf: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'openingAsOf')).toBe(true)
  })

  it('requires opening_balance when opening_as_of is set', () => {
    const { value, issues } = validateAccountRow(1, { name: 'X', type: 'cash', owner: '', openingBalance: '', openingAsOf: '2026-01-01' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'openingBalance')).toBe(true)
  })

  it('accepts both opening_balance and opening_as_of together', () => {
    const { value, issues } = validateAccountRow(1, { name: 'X', type: 'cash', owner: '', openingBalance: '1000', openingAsOf: '2026-01-01' }, ctx, 'dmy')
    expect(issues).toEqual([])
    expect(value?.openingBalance).toBe(1000)
    expect(value?.openingAsOf).toBe('2026-01-01')
  })
})

describe('validateCardRow', () => {
  it('requires statement_day and due_day within 1-31', () => {
    const { value, issues } = validateCardRow(
      1,
      { name: 'X', creditLimit: '10000', statementDay: '35', dueDay: '0', annualInterestRate: '', owner: '' },
      ctx,
    )
    expect(value).toBeNull()
    expect(hasError(issues, 'statementDay')).toBe(true)
    expect(hasError(issues, 'dueDay')).toBe(true)
  })

  it('accepts a valid card, defaulting interest rate to 0', () => {
    const { value, issues } = validateCardRow(
      1,
      { name: 'X', creditLimit: '10000', statementDay: '20', dueDay: '5', annualInterestRate: '', owner: '' },
      ctx,
    )
    expect(issues).toEqual([])
    expect(value?.annualInterestRate).toBe(0)
  })
})

describe('validateInstallmentRow', () => {
  const base = {
    name: 'Laptop',
    startDate: '15/01/2026',
    totalPeriods: '10',
    monthlyAmount: '1500',
    finalAmount: '',
    category: 'Electronics',
    instrument: 'Card •• 1234',
    annualInterestRate: '',
    isCashAdvance: '',
    owner: '',
    note: '',
    status: '',
    periodsPaid: '',
  }

  it('accepts a valid plan', () => {
    const { value, issues } = validateInstallmentRow(1, base, ctx, 'dmy')
    expect(issues).toEqual([])
    expect(value?.startDate).toBe('2026-01-15')
    expect(value?.status).toBe('active')
  })

  it('requires category to exist as an expense category — a plan with no category never posts (installmentMaterialiser.ts)', () => {
    const { value, issues } = validateInstallmentRow(1, { ...base, category: 'Salary' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'category')).toBe(true)
  })

  it('rejects periods_paid greater than total_periods', () => {
    const { value, issues } = validateInstallmentRow(1, { ...base, periodsPaid: '11' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'periodsPaid')).toBe(true)
  })

  it('rejects an instrument name that matches neither an account nor a card', () => {
    const { value, issues } = validateInstallmentRow(1, { ...base, instrument: 'Nowhere' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'instrument')).toBe(true)
  })

  it('rejects an instrument name that matches both an account and a card (ambiguous — one_source needs exactly one)', () => {
    const ambiguousCtx: ImportContext = { ...ctx, accounts: [...ctx.accounts, { name: 'Card •• 1234' }] }
    const { value, issues } = validateInstallmentRow(1, base, ambiguousCtx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'instrument')).toBe(true)
  })
})

describe('validateRecurringRuleRow', () => {
  const base = {
    name: 'Netflix',
    kind: 'expense',
    amount: '350',
    category: 'Groceries',
    freq: 'monthly',
    interval: '',
    dayOfMonth: '15',
    weekday: '',
    monthOfYear: '',
    monthEnd: '',
    startDate: '15/01/2026',
    endDate: '',
    instrument: 'Card •• 1234',
    toInstrument: '',
    autoPost: '',
    variableAmount: '',
    lastGeneratedDate: '',
    owner: '',
    note: '',
    active: '',
  }

  it('accepts a valid monthly rule', () => {
    const { value, issues } = validateRecurringRuleRow(1, base, ctx, 'dmy')
    expect(issues).toEqual([])
    expect(value?.dayOfMonth).toBe(15)
    expect(value?.autoPost).toBe(false) // DB default (0003): auto_post not null default false
  })

  it('requires day_of_month for a monthly rule (schedule_fields constraint)', () => {
    const { value, issues } = validateRecurringRuleRow(1, { ...base, dayOfMonth: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'dayOfMonth')).toBe(true)
  })

  it('requires weekday for a weekly rule, not day_of_month', () => {
    const { value, issues } = validateRecurringRuleRow(1, { ...base, freq: 'weekly', dayOfMonth: '', weekday: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'weekday')).toBe(true)
  })

  it('requires day_of_month AND month_of_year for a yearly rule', () => {
    const { value, issues } = validateRecurringRuleRow(1, { ...base, freq: 'yearly', monthOfYear: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'monthOfYear')).toBe(true)
  })

  it('rejects category for a transfer row instead of requiring it', () => {
    const { value, issues } = validateRecurringRuleRow(
      1,
      { ...base, kind: 'transfer', category: '', toInstrument: 'Bank — Earth' },
      ctx,
      'dmy',
    )
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(value?.categoryName).toBeNull()
  })

  it('requires to_instrument for a transfer row', () => {
    const { value, issues } = validateRecurringRuleRow(1, { ...base, kind: 'transfer', category: '', toInstrument: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'toInstrument')).toBe(true)
  })
})

describe('validateTransactionRow', () => {
  const base = {
    date: '03/01/2026',
    kind: 'expense',
    amount: '250',
    category: 'Groceries',
    instrument: 'Bank — Earth',
    toInstrument: '',
    note: 'Coffee',
    description: '',
    owner: '',
  }

  it('accepts a valid expense', () => {
    const { value, issues } = validateTransactionRow(1, base, ctx, 'dmy')
    expect(issues).toEqual([])
    expect(value?.date).toBe('2026-01-03')
    expect(value?.description).toBe('') // NOT NULL default '' (0003) — never null
  })

  it('requires category unless kind is transfer', () => {
    const { value, issues } = validateTransactionRow(1, { ...base, category: '' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'category')).toBe(true)
  })

  it('a transfer needs to_instrument and no category', () => {
    const { value, issues } = validateTransactionRow(
      1,
      { ...base, kind: 'transfer', category: '', toInstrument: 'Card •• 1234' },
      ctx,
      'dmy',
    )
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(value?.categoryName).toBeNull()
    expect(value?.toInstrumentName).toBe('Card •• 1234')
  })

  it('rejects a transfer to the same instrument it came from', () => {
    const { value, issues } = validateTransactionRow(
      1,
      { ...base, kind: 'transfer', category: '', instrument: 'Bank — Earth', toInstrument: 'Bank — Earth' },
      ctx,
      'dmy',
    )
    expect(value).toBeNull()
    expect(hasError(issues, 'toInstrument')).toBe(true)
  })

  it('rejects an unresolvable category name', () => {
    const { value, issues } = validateTransactionRow(1, { ...base, category: 'Nonexistent' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'category')).toBe(true)
  })

  it('rejects a category of the wrong kind (category_kind_matches / composite FK)', () => {
    // "Salary" exists but only as an income category — an expense row can't use it.
    const { value, issues } = validateTransactionRow(1, { ...base, kind: 'expense', category: 'Salary' }, ctx, 'dmy')
    expect(value).toBeNull()
    expect(hasError(issues, 'category')).toBe(true)
  })
})
