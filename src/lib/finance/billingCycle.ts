// Billing Cycle Engine (DESIGN.md §6.1–6.2). Dates are plain yyyy-MM-dd
// strings, always interpreted as Asia/Bangkok (no timezone conversion).

export interface CardLike {
  statement_day: number
  due_day: number
}

export interface Cycle {
  start: string
  end: string
  dueDate: string
}

function iso(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function parts(date: string): { year: number; month0: number; day: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { year: y, month0: m - 1, day: d }
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

// Clamp a target day to the last day of the given month (statement_day/
// due_day of 29-31 in a shorter month).
function clampedDate(year: number, month0: number, day: number): string {
  return iso(year, month0, Math.min(day, daysInMonth(year, month0)))
}

function addMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 }
}

/**
 * The billing cycle containing `date` for a card with the given
 * statement/due days. A cycle runs from (statement_day of month M-1) + 1
 * through (statement_day of month M); payment is due on due_day of month M,
 * or month M+1 if due_day <= statement_day (the due date always comes
 * after the statement closes).
 */
export function cycleOf(card: CardLike, date: string): Cycle {
  const { year, month0, day } = parts(date)

  // If `date` is on/before this month's statement day, it falls in the
  // cycle ending this month; otherwise it falls in next month's cycle.
  const endsInCurrentMonth = day <= Math.min(card.statement_day, daysInMonth(year, month0))
  const endMonth = endsInCurrentMonth ? { year, month0 } : addMonths(year, month0, 1)
  const end = clampedDate(endMonth.year, endMonth.month0, card.statement_day)

  const startMonth = addMonths(endMonth.year, endMonth.month0, -1)
  const startStatement = clampedDate(startMonth.year, startMonth.month0, card.statement_day)
  const start = addOneDay(startStatement)

  const dueMonth = card.due_day <= card.statement_day ? addMonths(endMonth.year, endMonth.month0, 1) : endMonth
  const dueDate = clampedDate(dueMonth.year, dueMonth.month0, card.due_day)

  return { start, end, dueDate }
}

/**
 * The billing cycle whose **due date falls in month M** (`yyyy-MM`), for the
 * Overview page's "cash to prepare this month" (DESIGN.md §7.3 v3.1).
 *
 * Inverts `cycleOf`'s due-date rule: a cycle closing in month E is due in E
 * when due_day > statement_day, otherwise in E+1 — so the cycle due in M
 * closes in M or M-1 respectively. Every card has exactly one such cycle per
 * month (due_day is clamped into range), so this is always well-defined.
 */
export function cycleDueInMonth(card: CardLike, monthKey: string): Cycle {
  const [year, month] = monthKey.split('-').map(Number)
  const endMonth =
    card.due_day <= card.statement_day ? addMonths(year, month - 1, -1) : { year, month0: month - 1 }
  // A date exactly on the statement day belongs to the cycle closing that
  // month, so cycleOf resolves the rest without duplicating the arithmetic.
  return cycleOf(card, clampedDate(endMonth.year, endMonth.month0, card.statement_day))
}

/** Shifts a date by `delta` days (negative goes backward). */
export function addDays(date: string, delta: number): string {
  const { year, month0, day } = parts(date)
  const d = new Date(year, month0, day + delta)
  return iso(d.getFullYear(), d.getMonth(), d.getDate())
}

function addOneDay(date: string): string {
  return addDays(date, 1)
}

/**
 * Which calendar date does installment period `n` (1-indexed) fall on,
 * given the plan's start_date? start_date + (n-1) months, clamped to the
 * last day of short months (31 Jan + 1 month = 28/29 Feb).
 */
export function periodDate(startDate: string, periodNo: number): string {
  const { year, month0, day } = parts(startDate)
  const target = addMonths(year, month0, periodNo - 1)
  return clampedDate(target.year, target.month0, day)
}

export interface InstallmentLike {
  id: string
  start_date: string
  total_periods: number
  monthly_amount: number
  final_amount: number | null
}

/**
 * Total installment charge falling inside [cycle.start, cycle.end].
 *
 * `paidPeriods` (keys "<installmentId>:<periodNo>") excludes periods that
 * already exist as real transactions (DESIGN §6.7 D11) — once
 * InstallmentMaterialiser posts a period, it's already inside the caller's
 * transaction total, so counting it here too would double it.
 */
export function installmentChargeInCycle(
  installment: InstallmentLike,
  cycle: Cycle,
  paidPeriods: ReadonlySet<string> = new Set(),
): number {
  let total = 0
  for (let n = 1; n <= installment.total_periods; n++) {
    if (paidPeriods.has(`${installment.id}:${n}`)) continue
    const date = periodDate(installment.start_date, n)
    if (date >= cycle.start && date <= cycle.end) {
      total += n === installment.total_periods && installment.final_amount != null
        ? installment.final_amount
        : installment.monthly_amount
    }
  }
  return total
}

export interface TransactionChargeLike {
  amount: number
  date: string
  kind: 'income' | 'expense' | 'transfer'
  to_card_id: string | null
}

/**
 * What is due on a card for one cycle:
 *   sum(transactions charged to the card within the cycle, excluding
 *       transfers TO the card, which are bill payments that settle it)
 * + sum(installment periods falling in the cycle)
 * + the cycle's adjustment row, if any.
 */
export function cycleBill(
  cycle: Cycle,
  cardId: string,
  transactionsOnCard: TransactionChargeLike[],
  installmentsOnCard: InstallmentLike[],
  adjustment: number | null,
  paidPeriods: ReadonlySet<string> = new Set(),
): number {
  const txnTotal = transactionsOnCard
    .filter((t) => t.date >= cycle.start && t.date <= cycle.end)
    .filter((t) => !(t.kind === 'transfer' && t.to_card_id === cardId))
    .reduce((sum, t) => sum + t.amount, 0)

  const installmentTotal = installmentsOnCard.reduce(
    (sum, inst) => sum + installmentChargeInCycle(inst, cycle, paidPeriods),
    0,
  )

  return txnTotal + installmentTotal + (adjustment ?? 0)
}
