import { addMonths, endOfMonth, format, parse, startOfMonth } from 'date-fns'

const MONTH_KEY = 'yyyy-MM'

export function currentMonthKey(): string {
  return format(new Date(), MONTH_KEY)
}

export function shiftMonth(monthKey: string, delta: number): string {
  return format(addMonths(parse(monthKey, MONTH_KEY, new Date()), delta), MONTH_KEY)
}

export function monthLabel(monthKey: string): string {
  return format(parse(monthKey, MONTH_KEY, new Date()), 'MMMM yyyy')
}

// "20 Jul" — for compact date and billing-cycle range labels.
export function dayMonthLabel(date: string): string {
  return format(parse(date, 'yyyy-MM-dd', new Date()), 'd MMM')
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
