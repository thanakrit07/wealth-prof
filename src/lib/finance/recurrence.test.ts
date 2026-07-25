import { describe, expect, it } from 'vitest'
import { nextOccurrence, occurrencesBetween, type RecurrenceSchedule } from './recurrence'

function monthly(overrides: Partial<RecurrenceSchedule> = {}): RecurrenceSchedule {
  return {
    freq: 'monthly',
    interval: 1,
    day_of_month: 25,
    month_of_year: null,
    weekday: null,
    month_end: 'clamp',
    start_date: '2026-01-01',
    end_date: null,
    max_occurrences: null,
    ...overrides,
  }
}

describe('monthly recurrence', () => {
  it('generates the scheduled day every month', () => {
    expect(occurrencesBetween(monthly(), '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-25',
      '2026-02-25',
      '2026-03-25',
    ])
  })

  it('clamps day 31 to the end of short months', () => {
    const rule = monthly({ day_of_month: 31 })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('clamps to Feb 29 in a leap year', () => {
    const rule = monthly({ day_of_month: 31, start_date: '2028-01-01' })
    expect(occurrencesBetween(rule, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })

  it('skips short months under the skip rule without breaking the cycle', () => {
    const rule = monthly({ day_of_month: 31, month_end: 'skip' })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ])
  })

  it('does not emit a candidate before start_date and keeps interval anchoring', () => {
    // Started Jan 15 with day 10: Jan 10 predates the rule; with interval 2
    // the cycle stays anchored to January, so the first hit is Mar 10.
    const rule = monthly({ day_of_month: 10, start_date: '2026-01-15', interval: 2 })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-06-30')).toEqual(['2026-03-10', '2026-05-10'])
  })

  it('respects end_date inclusively', () => {
    const rule = monthly({ end_date: '2026-02-25' })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-12-31')).toEqual(['2026-01-25', '2026-02-25'])
  })

  it('caps at max_occurrences counted from the rule start, not the window', () => {
    const rule = monthly({ max_occurrences: 3 })
    // Window starts after two occurrences already happened: only #3 remains.
    expect(occurrencesBetween(rule, '2026-03-01', '2026-12-31')).toEqual(['2026-03-25'])
  })

  it('skipped short months do not consume max_occurrences', () => {
    const rule = monthly({ day_of_month: 31, month_end: 'skip', max_occurrences: 3 })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ])
  })

  it('catches up over a long absence in one pass', () => {
    expect(occurrencesBetween(monthly(), '2026-01-01', '2026-12-31')).toHaveLength(12)
  })
})

describe('weekly recurrence', () => {
  const weekly = (overrides: Partial<RecurrenceSchedule> = {}): RecurrenceSchedule => ({
    freq: 'weekly',
    interval: 1,
    day_of_month: null,
    month_of_year: null,
    weekday: 1, // Monday
    month_end: 'clamp',
    start_date: '2026-01-01', // a Thursday
    end_date: null,
    max_occurrences: null,
    ...overrides,
  })

  it('starts at the first matching weekday on/after start_date', () => {
    expect(occurrencesBetween(weekly(), '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ])
  })

  it('honours interval in weeks', () => {
    expect(occurrencesBetween(weekly({ interval: 2 }), '2026-01-01', '2026-02-15')).toEqual([
      '2026-01-05',
      '2026-01-19',
      '2026-02-02',
    ])
  })

  it('starts on start_date itself when the weekday matches', () => {
    // 2026-01-05 is a Monday.
    expect(occurrencesBetween(weekly({ start_date: '2026-01-05' }), '2026-01-01', '2026-01-12')).toEqual([
      '2026-01-05',
      '2026-01-12',
    ])
  })
})

describe('yearly recurrence', () => {
  const yearly = (overrides: Partial<RecurrenceSchedule> = {}): RecurrenceSchedule => ({
    freq: 'yearly',
    interval: 1,
    day_of_month: 15,
    month_of_year: 7,
    weekday: null,
    month_end: 'clamp',
    start_date: '2026-01-01',
    end_date: null,
    max_occurrences: null,
    ...overrides,
  })

  it('generates one occurrence per year', () => {
    expect(occurrencesBetween(yearly(), '2026-01-01', '2028-12-31')).toEqual([
      '2026-07-15',
      '2027-07-15',
      '2028-07-15',
    ])
  })

  it('clamps Feb 29 to Feb 28 in non-leap years', () => {
    const rule = yearly({ day_of_month: 29, month_of_year: 2, start_date: '2028-01-01' })
    expect(occurrencesBetween(rule, '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
    ])
  })

  it('skips years where the day does not exist under the skip rule', () => {
    const rule = yearly({ day_of_month: 29, month_of_year: 2, month_end: 'skip', start_date: '2028-01-01' })
    expect(occurrencesBetween(rule, '2028-01-01', '2032-12-31')).toEqual(['2028-02-29', '2032-02-29'])
  })

  it('skips the first year when the date already passed before start_date', () => {
    const rule = yearly({ start_date: '2026-08-01' })
    expect(occurrencesBetween(rule, '2026-01-01', '2027-12-31')).toEqual(['2027-07-15'])
  })
})

describe('nextOccurrence', () => {
  it('returns the next scheduled date on/after the given day', () => {
    expect(nextOccurrence(monthly(), '2026-02-01')).toBe('2026-02-25')
    expect(nextOccurrence(monthly(), '2026-02-25')).toBe('2026-02-25')
    expect(nextOccurrence(monthly(), '2026-02-26')).toBe('2026-03-25')
  })

  it('returns null when the rule has ended', () => {
    expect(nextOccurrence(monthly({ end_date: '2026-03-01' }), '2026-04-01')).toBeNull()
    expect(nextOccurrence(monthly({ max_occurrences: 2 }), '2026-06-01')).toBeNull()
  })
})
