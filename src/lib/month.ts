import { addMonths, endOfMonth, format, parse, startOfMonth } from 'date-fns'

const MONTH_KEY = 'yyyy-MM'

// ADR-0005: years are displayed as Buddhist Era, in full ("2569", never "69" —
// that reads as 1969 once the month name is in English). This is a display
// conversion only — every stored or exchanged date stays Gregorian.
export function toBuddhistYear(ceYear: number): number {
  return ceYear + 543
}

export function currentMonthKey(): string {
  return format(new Date(), MONTH_KEY)
}

export function shiftMonth(monthKey: string, delta: number): string {
  return format(addMonths(parse(monthKey, MONTH_KEY, new Date()), delta), MONTH_KEY)
}

export function monthLabel(monthKey: string): string {
  const date = parse(monthKey, MONTH_KEY, new Date())
  return `${format(date, 'MMMM')} ${toBuddhistYear(date.getFullYear())}`
}

// "20 Jul" — for compact date and billing-cycle range labels.
export function dayMonthLabel(date: string): string {
  return format(parse(date, 'yyyy-MM-dd', new Date()), 'd MMM')
}

// "20 Jul 2569" — for dates that can't assume the current year, like a
// review row generated ahead of schedule.
export function fullDateLabel(date: string): string {
  const parsed = parse(date, 'yyyy-MM-dd', new Date())
  return `${format(parsed, 'd MMM')} ${toBuddhistYear(parsed.getFullYear())}`
}

// "20" and "Mon" — the two halves of a day-group header in the ledger.
export function dayOfMonthLabel(date: string): string {
  return format(parse(date, 'yyyy-MM-dd', new Date()), 'd')
}

export function weekdayLabel(date: string): string {
  return format(parse(date, 'yyyy-MM-dd', new Date()), 'EEE')
}

// Inclusive [start, end] plain-date range for the month, for querying
// transactions.date (DESIGN.md §4.3 — dates are always Asia/Bangkok).
export function monthRange(monthKey: string): { start: string; end: string } {
  const date = parse(monthKey, MONTH_KEY, new Date())
  return {
    start: format(startOfMonth(date), 'yyyy-MM-dd'),
    end: format(endOfMonth(date), 'yyyy-MM-dd'),
  }
}
