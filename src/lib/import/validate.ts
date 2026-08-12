import { parseAmount, parseBool, parseDate, parseDay, parseInteger, normalizeName } from './values'
import type {
  DateFormat,
  EntityKind,
  ImportContext,
  ImportIssue,
  PlannedAccount,
  PlannedCard,
  PlannedCategory,
  PlannedInstallment,
  PlannedRecurringRule,
  PlannedTransaction,
} from './types'

interface RowCtx {
  entity: EntityKind
  rowNumber: number
  issues: ImportIssue[]
}

function fail(ctx: RowCtx, field: string, message: string) {
  ctx.issues.push({ severity: 'error', entity: ctx.entity, rowNumber: ctx.rowNumber, field, message })
}

function warn(ctx: RowCtx, field: string, message: string) {
  ctx.issues.push({ severity: 'warning', entity: ctx.entity, rowNumber: ctx.rowNumber, field, message })
}

function requiredText(ctx: RowCtx, raw: Record<string, string>, key: string, label: string): string | null {
  const value = (raw[key] ?? '').trim()
  if (!value) {
    fail(ctx, key, `${label} is required.`)
    return null
  }
  return value
}

function optionalText(raw: Record<string, string>, key: string): string | null {
  const value = (raw[key] ?? '').trim()
  return value || null
}

function requiredEnum<T extends string>(ctx: RowCtx, raw: Record<string, string>, key: string, label: string, values: readonly T[]): T | null {
  const value = (raw[key] ?? '').trim().toLowerCase()
  if (!value) {
    fail(ctx, key, `${label} is required (${values.join('/')}).`)
    return null
  }
  const match = values.find((v) => v === value)
  if (!match) {
    fail(ctx, key, `${label} "${raw[key]}" is not one of ${values.join('/')}.`)
    return null
  }
  return match
}

function optionalEnum<T extends string>(ctx: RowCtx, raw: Record<string, string>, key: string, label: string, values: readonly T[], fallback: T): T {
  const value = (raw[key] ?? '').trim().toLowerCase()
  if (!value) return fallback
  const match = values.find((v) => v === value)
  if (!match) {
    fail(ctx, key, `${label} "${raw[key]}" is not one of ${values.join('/')}.`)
    return fallback
  }
  return match
}

function requiredNumber(ctx: RowCtx, raw: Record<string, string>, key: string, label: string): number | null {
  const value = (raw[key] ?? '').trim()
  if (!value) {
    fail(ctx, key, `${label} is required.`)
    return null
  }
  const n = parseAmount(value)
  if (n === null) {
    fail(ctx, key, `${label} "${value}" is not a number.`)
    return null
  }
  if (n <= 0) {
    fail(ctx, key, `${label} must be greater than 0.`)
    return null
  }
  return n
}

function optionalNumber(ctx: RowCtx, raw: Record<string, string>, key: string, label: string, fallback: number): number {
  const value = (raw[key] ?? '').trim()
  if (!value) return fallback
  const n = parseAmount(value)
  if (n === null) {
    fail(ctx, key, `${label} "${value}" is not a number.`)
    return fallback
  }
  return n
}

function requiredDay(ctx: RowCtx, raw: Record<string, string>, key: string, label: string): number | null {
  const value = (raw[key] ?? '').trim()
  if (!value) {
    fail(ctx, key, `${label} is required (1-31).`)
    return null
  }
  const n = parseDay(value)
  if (n === null) {
    fail(ctx, key, `${label} "${value}" is not a day between 1 and 31.`)
    return null
  }
  return n
}

function requiredDate(ctx: RowCtx, raw: Record<string, string>, key: string, label: string, format: DateFormat): string | null {
  const value = (raw[key] ?? '').trim()
  if (!value) {
    fail(ctx, key, `${label} is required.`)
    return null
  }
  const parsed = parseDate(value, format)
  if (!parsed) {
    fail(ctx, key, `${label} "${value}" could not be read as a date.`)
    return null
  }
  return parsed
}

function optionalDate(ctx: RowCtx, raw: Record<string, string>, key: string, label: string, format: DateFormat): string | null {
  const value = (raw[key] ?? '').trim()
  if (!value) return null
  const parsed = parseDate(value, format)
  if (!parsed) {
    fail(ctx, key, `${label} "${value}" could not be read as a date.`)
    return null
  }
  return parsed
}

function memberExists(name: string, ctx: ImportContext): boolean {
  const norm = normalizeName(name)
  return ctx.members.some((m) => normalizeName(m.name) === norm)
}

function categoryExists(name: string, kind: 'income' | 'expense', ctx: ImportContext): boolean {
  const norm = normalizeName(name)
  return ctx.categories.some((c) => c.kind === kind && normalizeName(c.name) === norm)
}

type InstrumentLookup = 'account' | 'card' | 'ambiguous' | 'none'

function findInstrument(name: string, ctx: ImportContext): InstrumentLookup {
  const norm = normalizeName(name)
  const inAccounts = ctx.accounts.some((a) => normalizeName(a.name) === norm)
  const inCards = ctx.cards.some((c) => normalizeName(c.name) === norm)
  if (inAccounts && inCards) return 'ambiguous'
  if (inAccounts) return 'account'
  if (inCards) return 'card'
  return 'none'
}

function checkOwnerRef(rowCtx: RowCtx, raw: Record<string, string>, key: string, ctx: ImportContext): string | null {
  const name = optionalText(raw, key)
  if (!name) return null
  if (!memberExists(name, ctx)) {
    fail(rowCtx, key, `Owner "${name}" is not a household member.`)
    return null
  }
  return name
}

// Category ref is required unless the row's kind is 'transfer' — every
// caller passes the row's own kind so this one function covers accounts'
// worth of "required unless transfer" logic across three entities.
function checkCategoryRef(
  rowCtx: RowCtx,
  raw: Record<string, string>,
  key: string,
  kind: 'income' | 'expense' | 'transfer',
  ctx: ImportContext,
): string | null {
  const name = optionalText(raw, key)
  if (kind === 'transfer') {
    if (name) warn(rowCtx, key, `Category is ignored for a transfer row.`)
    return null
  }
  if (!name) {
    fail(rowCtx, key, `Category is required (Kind is ${kind}).`)
    return null
  }
  if (!categoryExists(name, kind, ctx)) {
    fail(rowCtx, key, `Category "${name}" (${kind}) was not found — check the name and Kind match an existing or newly-added category.`)
    return null
  }
  return name
}

// installments.category has no transfer case — it's always required.
function checkExpenseCategoryRef(rowCtx: RowCtx, raw: Record<string, string>, key: string, ctx: ImportContext): string | null {
  const name = requiredText(rowCtx, raw, key, 'Category')
  if (!name) return null
  if (!categoryExists(name, 'expense', ctx)) {
    fail(rowCtx, key, `Category "${name}" (expense) was not found.`)
    return null
  }
  return name
}

function checkInstrumentRef(rowCtx: RowCtx, raw: Record<string, string>, key: string, label: string, ctx: ImportContext): string | null {
  const name = requiredText(rowCtx, raw, key, label)
  if (!name) return null
  const found = findInstrument(name, ctx)
  if (found === 'none') {
    fail(rowCtx, key, `${label} "${name}" was not found among accounts or cards.`)
    return null
  }
  if (found === 'ambiguous') {
    fail(rowCtx, key, `${label} "${name}" matches both an account and a card — rename one so it's unambiguous.`)
    return null
  }
  return name
}

function checkOptionalInstrumentRef(
  rowCtx: RowCtx,
  raw: Record<string, string>,
  key: string,
  label: string,
  required: boolean,
  ctx: ImportContext,
): string | null {
  const name = optionalText(raw, key)
  if (!name) {
    if (required) fail(rowCtx, key, `${label} is required for a transfer row.`)
    return null
  }
  if (!required) warn(rowCtx, key, `${label} is ignored unless Kind is transfer.`)
  const found = findInstrument(name, ctx)
  if (found === 'none') {
    fail(rowCtx, key, `${label} "${name}" was not found among accounts or cards.`)
    return null
  }
  if (found === 'ambiguous') {
    fail(rowCtx, key, `${label} "${name}" matches both an account and a card — rename one so it's unambiguous.`)
    return null
  }
  return name
}

export function validateCategoryRow(rowNumber: number, raw: Record<string, string>, ctx: ImportContext): { value: PlannedCategory | null; issues: ImportIssue[] } {
  const rowCtx: RowCtx = { entity: 'categories', rowNumber, issues: [] }
  const name = requiredText(rowCtx, raw, 'name', 'Name')
  const kind = requiredEnum(rowCtx, raw, 'kind', 'Kind', ['income', 'expense'] as const)
  const parentName = optionalText(raw, 'parent')
  if (parentName && kind && !categoryExists(parentName, kind, ctx)) {
    fail(rowCtx, 'parent', `Parent category "${parentName}" (${kind}) was not found — it must be a main category defined earlier (in this file or already in the app).`)
  }
  const icon = optionalText(raw, 'icon')
  const color = optionalText(raw, 'color')

  if (!name || !kind || rowCtx.issues.some((i) => i.severity === 'error')) {
    return { value: null, issues: rowCtx.issues }
  }
  return { value: { name, kind, parentName, icon, color }, issues: rowCtx.issues }
}

export function validateAccountRow(
  rowNumber: number,
  raw: Record<string, string>,
  ctx: ImportContext,
  dateFormat: DateFormat,
): { value: PlannedAccount | null; issues: ImportIssue[] } {
  const rowCtx: RowCtx = { entity: 'accounts', rowNumber, issues: [] }
  const name = requiredText(rowCtx, raw, 'name', 'Name')
  const type = requiredEnum(rowCtx, raw, 'type', 'Type', ['bank', 'cash', 'ewallet'] as const)
  const ownerName = checkOwnerRef(rowCtx, raw, 'owner', ctx)

  const balanceRaw = optionalText(raw, 'openingBalance')
  const asOfRaw = optionalText(raw, 'openingAsOf')
  let openingBalance: number | null = null
  let openingAsOf: string | null = null
  if (balanceRaw && !asOfRaw) {
    fail(rowCtx, 'openingAsOf', 'Opening as of is required when Opening balance is set.')
  } else if (asOfRaw && !balanceRaw) {
    fail(rowCtx, 'openingBalance', 'Opening balance is required when Opening as of is set.')
  } else if (balanceRaw && asOfRaw) {
    const n = parseAmount(balanceRaw)
    if (n === null) fail(rowCtx, 'openingBalance', `Opening balance "${balanceRaw}" is not a number.`)
    else openingBalance = n
    const d = parseDate(asOfRaw, dateFormat)
    if (!d) fail(rowCtx, 'openingAsOf', `Opening as of "${asOfRaw}" could not be read as a date.`)
    else openingAsOf = d
  }

  if (!name || !type || rowCtx.issues.some((i) => i.severity === 'error')) {
    return { value: null, issues: rowCtx.issues }
  }
  return { value: { name, type, ownerName, openingBalance, openingAsOf }, issues: rowCtx.issues }
}

export function validateCardRow(rowNumber: number, raw: Record<string, string>, ctx: ImportContext): { value: PlannedCard | null; issues: ImportIssue[] } {
  const rowCtx: RowCtx = { entity: 'cards', rowNumber, issues: [] }
  const name = requiredText(rowCtx, raw, 'name', 'Name')
  const creditLimit = requiredNumber(rowCtx, raw, 'creditLimit', 'Credit limit')
  const statementDay = requiredDay(rowCtx, raw, 'statementDay', 'Statement day')
  const dueDay = requiredDay(rowCtx, raw, 'dueDay', 'Due day')
  const annualInterestRate = optionalNumber(rowCtx, raw, 'annualInterestRate', 'Annual interest rate', 0)
  const ownerName = checkOwnerRef(rowCtx, raw, 'owner', ctx)

  if (!name || creditLimit === null || statementDay === null || dueDay === null || rowCtx.issues.some((i) => i.severity === 'error')) {
    return { value: null, issues: rowCtx.issues }
  }
  return { value: { name, creditLimit, statementDay, dueDay, annualInterestRate, ownerName }, issues: rowCtx.issues }
}

export function validateInstallmentRow(
  rowNumber: number,
  raw: Record<string, string>,
  ctx: ImportContext,
  dateFormat: DateFormat,
): { value: PlannedInstallment | null; issues: ImportIssue[] } {
  const rowCtx: RowCtx = { entity: 'installments', rowNumber, issues: [] }
  const name = requiredText(rowCtx, raw, 'name', 'Name')
  const startDate = requiredDate(rowCtx, raw, 'startDate', 'Start date', dateFormat)
  const totalPeriodsRaw = optionalText(raw, 'totalPeriods')
  const totalPeriods = totalPeriodsRaw ? parseInteger(totalPeriodsRaw) : null
  if (!totalPeriodsRaw) fail(rowCtx, 'totalPeriods', 'Total periods is required.')
  else if (totalPeriods === null || totalPeriods <= 0) fail(rowCtx, 'totalPeriods', `Total periods "${totalPeriodsRaw}" must be a positive whole number.`)
  const monthlyAmount = requiredNumber(rowCtx, raw, 'monthlyAmount', 'Monthly amount')
  const finalAmountRaw = optionalText(raw, 'finalAmount')
  const finalAmount = finalAmountRaw ? parseAmount(finalAmountRaw) : null
  if (finalAmountRaw && finalAmount === null) fail(rowCtx, 'finalAmount', `Final amount "${finalAmountRaw}" is not a number.`)
  const categoryName = checkExpenseCategoryRef(rowCtx, raw, 'category', ctx)
  const instrumentName = checkInstrumentRef(rowCtx, raw, 'instrument', 'Account or card', ctx)
  const annualInterestRate = optionalNumber(rowCtx, raw, 'annualInterestRate', 'Annual interest rate', 0)
  const isCashAdvance = parseBool(raw.isCashAdvance ?? '', false)
  const ownerName = checkOwnerRef(rowCtx, raw, 'owner', ctx)
  const note = optionalText(raw, 'note')
  const status = optionalEnum(rowCtx, raw, 'status', 'Status', ['active', 'done', 'cancelled'] as const, 'active')
  const periodsPaidRaw = optionalText(raw, 'periodsPaid')
  const periodsPaid = periodsPaidRaw ? (parseInteger(periodsPaidRaw) ?? 0) : 0
  if (periodsPaidRaw && parseInteger(periodsPaidRaw) === null) fail(rowCtx, 'periodsPaid', `Periods paid "${periodsPaidRaw}" is not a whole number.`)
  if (totalPeriods !== null && periodsPaid > totalPeriods) fail(rowCtx, 'periodsPaid', `Periods paid (${periodsPaid}) cannot exceed Total periods (${totalPeriods}).`)

  if (
    !name ||
    !startDate ||
    totalPeriods === null ||
    monthlyAmount === null ||
    !categoryName ||
    !instrumentName ||
    rowCtx.issues.some((i) => i.severity === 'error')
  ) {
    return { value: null, issues: rowCtx.issues }
  }
  return {
    value: {
      name,
      startDate,
      totalPeriods,
      monthlyAmount,
      finalAmount,
      categoryName,
      instrumentName,
      annualInterestRate,
      isCashAdvance,
      ownerName,
      note,
      status,
      periodsPaid,
    },
    issues: rowCtx.issues,
  }
}

const FREQ_VALUES = ['weekly', 'monthly', 'yearly'] as const

export function validateRecurringRuleRow(
  rowNumber: number,
  raw: Record<string, string>,
  ctx: ImportContext,
  dateFormat: DateFormat,
): { value: PlannedRecurringRule | null; issues: ImportIssue[] } {
  const rowCtx: RowCtx = { entity: 'recurringRules', rowNumber, issues: [] }
  const name = requiredText(rowCtx, raw, 'name', 'Name')
  const kind = requiredEnum(rowCtx, raw, 'kind', 'Kind', ['income', 'expense', 'transfer'] as const)
  const amount = requiredNumber(rowCtx, raw, 'amount', 'Amount')
  const categoryName = kind ? checkCategoryRef(rowCtx, raw, 'category', kind, ctx) : null
  const freq = requiredEnum(rowCtx, raw, 'freq', 'Frequency', FREQ_VALUES)
  const intervalRaw = optionalText(raw, 'interval')
  const interval = intervalRaw ? parseInteger(intervalRaw) : 1
  if (intervalRaw && (interval === null || interval <= 0)) fail(rowCtx, 'interval', `Interval "${intervalRaw}" must be a positive whole number.`)

  let dayOfMonth: number | null = null
  let weekday: number | null = null
  let monthOfYear: number | null = null
  if (freq === 'weekly') {
    const w = optionalText(raw, 'weekday')
    weekday = w ? parseInteger(w) : null
    if (!w) fail(rowCtx, 'weekday', 'Weekday is required for a weekly rule.')
    else if (weekday === null || weekday < 0 || weekday > 6) fail(rowCtx, 'weekday', `Weekday "${w}" must be 0-6.`)
  } else if (freq === 'monthly' || freq === 'yearly') {
    dayOfMonth = requiredDay(rowCtx, raw, 'dayOfMonth', 'Day of month')
    if (freq === 'yearly') {
      const m = optionalText(raw, 'monthOfYear')
      monthOfYear = m ? parseInteger(m) : null
      if (!m) fail(rowCtx, 'monthOfYear', 'Month of year is required for a yearly rule.')
      else if (monthOfYear === null || monthOfYear < 1 || monthOfYear > 12) fail(rowCtx, 'monthOfYear', `Month of year "${m}" must be 1-12.`)
    }
  }

  const monthEnd = optionalEnum(rowCtx, raw, 'monthEnd', 'Month-end rule', ['clamp', 'skip'] as const, 'clamp')
  const startDate = requiredDate(rowCtx, raw, 'startDate', 'Start date', dateFormat)
  const endDate = optionalDate(rowCtx, raw, 'endDate', 'End date', dateFormat)
  if (startDate && endDate && endDate < startDate) warn(rowCtx, 'endDate', 'End date is before Start date.')

  const instrumentName = checkInstrumentRef(rowCtx, raw, 'instrument', 'Account or card', ctx)
  const toInstrumentName = checkOptionalInstrumentRef(rowCtx, raw, 'toInstrument', 'To account or card', kind === 'transfer', ctx)

  const autoPost = parseBool(raw.autoPost ?? '', false)
  const variableAmount = parseBool(raw.variableAmount ?? '', false)
  const lastGeneratedDate = optionalDate(rowCtx, raw, 'lastGeneratedDate', 'Last generated date', dateFormat)
  const ownerName = checkOwnerRef(rowCtx, raw, 'owner', ctx)
  const note = optionalText(raw, 'note')
  const active = parseBool(raw.active ?? '', true)

  if (
    !name ||
    !kind ||
    amount === null ||
    !freq ||
    !startDate ||
    !instrumentName ||
    rowCtx.issues.some((i) => i.severity === 'error')
  ) {
    return { value: null, issues: rowCtx.issues }
  }
  return {
    value: {
      name,
      kind,
      amount,
      categoryName,
      freq,
      interval: interval ?? 1,
      dayOfMonth,
      weekday,
      monthOfYear,
      monthEnd,
      startDate,
      endDate,
      instrumentName,
      toInstrumentName,
      autoPost,
      variableAmount,
      lastGeneratedDate,
      ownerName,
      note,
      active,
    },
    issues: rowCtx.issues,
  }
}

export function validateTransactionRow(
  rowNumber: number,
  raw: Record<string, string>,
  ctx: ImportContext,
  dateFormat: DateFormat,
): { value: PlannedTransaction | null; issues: ImportIssue[] } {
  const rowCtx: RowCtx = { entity: 'transactions', rowNumber, issues: [] }
  const date = requiredDate(rowCtx, raw, 'date', 'Date', dateFormat)
  const kind = requiredEnum(rowCtx, raw, 'kind', 'Kind', ['income', 'expense', 'transfer'] as const)
  const amount = requiredNumber(rowCtx, raw, 'amount', 'Amount')
  const categoryName = kind ? checkCategoryRef(rowCtx, raw, 'category', kind, ctx) : null
  const instrumentName = checkInstrumentRef(rowCtx, raw, 'instrument', 'Account or card', ctx)
  const toInstrumentName = checkOptionalInstrumentRef(rowCtx, raw, 'toInstrument', 'To account or card', kind === 'transfer', ctx)
  if (instrumentName && toInstrumentName && instrumentName.trim().toLowerCase() === toInstrumentName.trim().toLowerCase()) {
    fail(rowCtx, 'toInstrument', 'Account or card and To account or card must be different.')
  }
  const note = optionalText(raw, 'note')
  const description = optionalText(raw, 'description') ?? ''
  const ownerName = checkOwnerRef(rowCtx, raw, 'owner', ctx)

  if (!date || !kind || amount === null || !instrumentName || rowCtx.issues.some((i) => i.severity === 'error')) {
    return { value: null, issues: rowCtx.issues }
  }
  return { value: { date, kind, amount, categoryName, instrumentName, toInstrumentName, note, description, ownerName }, issues: rowCtx.issues }
}
