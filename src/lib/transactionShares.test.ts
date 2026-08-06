import { describe, expect, it } from 'vitest'
import { computeShareRows } from './transactionShares'

const A = 'member-a'
const B = 'member-b'
const C = 'member-c'

describe('computeShareRows', () => {
  it('splits evenly across every member when owner is null', () => {
    expect(
      computeShareRows({ kind: 'expense', ownerId: null, frontingMemberId: A, amount: 100, memberIds: [A, B] }),
    ).toEqual([
      { member_id: A, share_amount: 50 },
      { member_id: B, share_amount: 50 },
    ])
  })

  it('gives the remainder cent to the earliest members so the split still sums to the total', () => {
    const rows = computeShareRows({ kind: 'expense', ownerId: null, frontingMemberId: A, amount: 10, memberIds: [A, B, C] })
    expect(rows).toEqual([
      { member_id: A, share_amount: 3.34 },
      { member_id: B, share_amount: 3.33 },
      { member_id: C, share_amount: 3.33 },
    ])
    expect(rows.reduce((sum, r) => sum + r.share_amount, 0)).toBeCloseTo(10, 2)
  })

  it('drops a member whose even split would round to zero', () => {
    const rows = computeShareRows({ kind: 'expense', ownerId: null, frontingMemberId: A, amount: 0.01, memberIds: [A, B] })
    expect(rows).toEqual([{ member_id: A, share_amount: 0.01 }])
  })

  it('does not split when owner is null but there is only one member', () => {
    expect(computeShareRows({ kind: 'expense', ownerId: null, frontingMemberId: A, amount: 100, memberIds: [A] })).toEqual([])
  })

  it('creates a single full-amount borrow row when the owner differs from who fronted it', () => {
    expect(
      computeShareRows({ kind: 'expense', ownerId: A, frontingMemberId: B, amount: 690, memberIds: [A, B] }),
    ).toEqual([{ member_id: A, share_amount: 690 }])
  })

  it('creates no rows for a personal expense (owner matches who fronted it)', () => {
    expect(computeShareRows({ kind: 'expense', ownerId: A, frontingMemberId: A, amount: 65, memberIds: [A, B] })).toEqual([])
  })

  it('creates no rows when nothing fronted the money is known', () => {
    expect(computeShareRows({ kind: 'expense', ownerId: A, frontingMemberId: null, amount: 65, memberIds: [A, B] })).toEqual([])
  })

  it('never splits income, even shaped like a shared or borrowed expense', () => {
    expect(computeShareRows({ kind: 'income', ownerId: null, frontingMemberId: A, amount: 50000, memberIds: [A, B] })).toEqual([])
    expect(computeShareRows({ kind: 'income', ownerId: A, frontingMemberId: B, amount: 50000, memberIds: [A, B] })).toEqual([])
  })

  it('never splits a transfer', () => {
    expect(computeShareRows({ kind: 'transfer', ownerId: null, frontingMemberId: A, amount: 500, memberIds: [A, B] })).toEqual([])
  })

  describe('custom (the Who-bears panel)', () => {
    it('uses the explicit breakdown verbatim instead of the owner/fronting heuristic', () => {
      expect(
        computeShareRows({
          kind: 'expense',
          ownerId: A,
          frontingMemberId: A,
          amount: 200,
          memberIds: [A, B],
          custom: [
            { member_id: A, share_amount: 120 },
            { member_id: B, share_amount: 80 },
          ],
        }),
      ).toEqual([
        { member_id: A, share_amount: 120 },
        { member_id: B, share_amount: 80 },
      ])
    })

    it('an empty custom array is "Just you" — no rows, regardless of who fronted it', () => {
      expect(
        computeShareRows({ kind: 'expense', ownerId: A, frontingMemberId: B, amount: 200, memberIds: [A, B], custom: [] }),
      ).toEqual([])
    })

    it('drops a zero-amount row from a custom breakdown', () => {
      expect(
        computeShareRows({
          kind: 'expense',
          ownerId: A,
          frontingMemberId: A,
          amount: 200,
          memberIds: [A, B],
          custom: [
            { member_id: A, share_amount: 0 },
            { member_id: B, share_amount: 200 },
          ],
        }),
      ).toEqual([{ member_id: B, share_amount: 200 }])
    })

    it('still never splits income even with an explicit custom breakdown', () => {
      expect(
        computeShareRows({
          kind: 'income',
          ownerId: A,
          frontingMemberId: A,
          amount: 200,
          memberIds: [A, B],
          custom: [{ member_id: B, share_amount: 200 }],
        }),
      ).toEqual([])
    })
  })
})
