import { describe, expect, it } from 'vitest'
import { cycleBill, cycleDueInMonth, cycleOf, installmentChargeInCycle, periodDate } from './billingCycle'

describe('cycleOf', () => {
  it('places a date after the statement day in the cycle ending next month', () => {
    const card = { statement_day: 5, due_day: 20 }
    expect(cycleOf(card, '2026-01-10')).toEqual({
      start: '2026-01-06',
      end: '2026-02-05',
      dueDate: '2026-02-20',
    })
  })

  it('places a date on/before the statement day in the cycle ending this month', () => {
    const card = { statement_day: 5, due_day: 20 }
    expect(cycleOf(card, '2026-01-05')).toEqual({
      start: '2025-12-06',
      end: '2026-01-05',
      dueDate: '2026-01-20',
    })
  })

  it('rolls the due date into the next month when due_day <= statement_day', () => {
    // Due day (3) is before statement day (25) in calendar terms, so the
    // payment for the cycle ending in month M falls in month M+1.
    const card = { statement_day: 25, due_day: 3 }
    const cycle = cycleOf(card, '2026-01-10')
    expect(cycle).toEqual({ start: '2025-12-26', end: '2026-01-25', dueDate: '2026-02-03' })
  })

  it('clamps statement_day 31 in a 30-day month', () => {
    const card = { statement_day: 31, due_day: 15 }
    // April has 30 days, so the statement closes on the 30th; March (31
    // days) needs no clamping, so the cycle starts the day after March 31.
    expect(cycleOf(card, '2026-04-15')).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
      dueDate: '2026-05-15',
    })
  })

  it('clamps statement_day 31 around February in a non-leap year', () => {
    const card = { statement_day: 31, due_day: 15 }
    // January (31 days) needs no clamping, so the cycle starts Feb 1.
    expect(cycleOf(card, '2026-02-15')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
      dueDate: '2026-03-15',
    })
  })

  it('clamps statement_day 31 around February in a leap year', () => {
    const card = { statement_day: 31, due_day: 15 }
    expect(cycleOf(card, '2028-02-15')).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
      dueDate: '2028-03-15',
    })
  })

  it('a date exactly on the statement day starts the next cycle the following day', () => {
    const card = { statement_day: 5, due_day: 20 }
    const cycle = cycleOf(card, '2026-01-06')
    expect(cycle.start).toBe('2026-01-06')
    expect(cycle.end).toBe('2026-02-05')
  })
})

describe('cycleDueInMonth', () => {
  it('returns the cycle closing in the same month when due_day > statement_day', () => {
    // KTC-style: statement 19th, due 25th — the 20 Jul–19 Aug cycle is due 25 Aug.
    const card = { statement_day: 19, due_day: 25 }
    expect(cycleDueInMonth(card, '2026-08')).toEqual({
      start: '2026-07-20',
      end: '2026-08-19',
      dueDate: '2026-08-25',
    })
  })

  it('returns the previous month\'s cycle when due_day <= statement_day', () => {
    // Due date rolls past the statement, so August's payment settles the
    // cycle that closed in July.
    const card = { statement_day: 19, due_day: 5 }
    expect(cycleDueInMonth(card, '2026-08')).toEqual({
      start: '2026-06-20',
      end: '2026-07-19',
      dueDate: '2026-08-05',
    })
  })

  it('crosses the year boundary when the due month is January', () => {
    const card = { statement_day: 19, due_day: 5 }
    expect(cycleDueInMonth(card, '2027-01')).toEqual({
      start: '2026-11-20',
      end: '2026-12-19',
      dueDate: '2027-01-05',
    })
  })

  it('clamps statement_day 31 into a short closing month', () => {
    const card = { statement_day: 31, due_day: 15 }
    // Closes 31 Mar (due 15 Apr); the cycle starts the day after February's
    // clamped statement date (28 Feb in 2026).
    expect(cycleDueInMonth(card, '2026-04')).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
      dueDate: '2026-04-15',
    })
  })

  it('agrees with cycleOf: the returned cycle is really due in the asked month', () => {
    const card = { statement_day: 19, due_day: 25 }
    const cycle = cycleDueInMonth(card, '2026-08')
    expect(cycleOf(card, cycle.end)).toEqual(cycle)
    expect(cycle.dueDate.slice(0, 7)).toBe('2026-08')
  })
})

describe('periodDate', () => {
  it('adds (n-1) months to start_date', () => {
    expect(periodDate('2026-01-15', 1)).toBe('2026-01-15')
    expect(periodDate('2026-01-15', 3)).toBe('2026-03-15')
  })

  it('clamps 31 Jan + 1 month to the end of February', () => {
    expect(periodDate('2026-01-31', 2)).toBe('2026-02-28')
  })

  it('clamps to Feb 29 in a leap year', () => {
    expect(periodDate('2028-01-31', 2)).toBe('2028-02-29')
  })
})

describe('installmentChargeInCycle', () => {
  it('sums only the periods whose date falls inside the cycle', () => {
    const installment = { id: 'inst-1', start_date: '2026-01-15', total_periods: 12, monthly_amount: 1000, final_amount: null }
    const cycle = { start: '2026-02-06', end: '2026-03-05', dueDate: '2026-03-20' }
    // Only period 2 (2026-02-15) falls in this cycle.
    expect(installmentChargeInCycle(installment, cycle)).toBe(1000)
  })

  it('uses final_amount for the last period', () => {
    const installment = { id: 'inst-1', start_date: '2026-01-15', total_periods: 2, monthly_amount: 1000, final_amount: 750 }
    const cycle = { start: '2026-02-06', end: '2026-03-05', dueDate: '2026-03-20' }
    expect(installmentChargeInCycle(installment, cycle)).toBe(750)
  })

  it('excludes a period already posted as a real transaction (D11 double-count guard)', () => {
    const installment = { id: 'inst-1', start_date: '2026-01-15', total_periods: 12, monthly_amount: 1000, final_amount: null }
    const cycle = { start: '2026-02-06', end: '2026-03-05', dueDate: '2026-03-20' }
    expect(installmentChargeInCycle(installment, cycle, new Set(['inst-1:2']))).toBe(0)
  })

  it('does not exclude another installment\'s period of the same number', () => {
    const installment = { id: 'inst-1', start_date: '2026-01-15', total_periods: 12, monthly_amount: 1000, final_amount: null }
    const cycle = { start: '2026-02-06', end: '2026-03-05', dueDate: '2026-03-20' }
    expect(installmentChargeInCycle(installment, cycle, new Set(['inst-2:2']))).toBe(1000)
  })
})

describe('cycleBill', () => {
  const cycle = { start: '2026-01-06', end: '2026-02-05', dueDate: '2026-02-20' }
  const cardId = 'card-1'

  it('sums card transactions in the cycle, excludes transfers paying it off', () => {
    const transactions = [
      { amount: 500, date: '2026-01-10', kind: 'expense' as const, to_card_id: null },
      { amount: 300, date: '2026-01-20', kind: 'expense' as const, to_card_id: null },
      // A transfer TO this card is a bill payment — it settles the bill,
      // not a charge on it (D7).
      { amount: 800, date: '2026-01-25', kind: 'transfer' as const, to_card_id: cardId },
      // Outside the cycle window.
      { amount: 999, date: '2026-02-10', kind: 'expense' as const, to_card_id: null },
    ]
    expect(cycleBill(cycle, cardId, transactions, [], null)).toBe(800)
  })

  it('adds installment charges falling in the cycle', () => {
    const installments = [{ id: 'inst-1', start_date: '2026-01-06', total_periods: 3, monthly_amount: 200, final_amount: null }]
    expect(cycleBill(cycle, cardId, [], installments, null)).toBe(200)
  })

  it('applies the signed adjustment on top', () => {
    expect(cycleBill(cycle, cardId, [], [], -150)).toBe(-150)
  })

  it('combines transactions, installments, and the adjustment', () => {
    const transactions = [{ amount: 500, date: '2026-01-10', kind: 'expense' as const, to_card_id: null }]
    const installments = [{ id: 'inst-1', start_date: '2026-01-06', total_periods: 3, monthly_amount: 200, final_amount: null }]
    expect(cycleBill(cycle, cardId, transactions, installments, 50)).toBe(750)
  })

  it('does not double-count a period already posted as a transaction (D11)', () => {
    // The materialiser already turned period 1 into a real transaction on
    // the card — it must appear in txnTotal only, not in both terms.
    const transactions = [{ amount: 200, date: '2026-01-06', kind: 'expense' as const, to_card_id: null }]
    const installments = [{ id: 'inst-1', start_date: '2026-01-06', total_periods: 3, monthly_amount: 200, final_amount: null }]
    expect(cycleBill(cycle, cardId, transactions, installments, null, new Set(['inst-1:1']))).toBe(200)
  })
})
