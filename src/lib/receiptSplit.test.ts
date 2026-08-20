import { describe, expect, it } from 'vitest'
import { inheritedSplitFor } from './receiptSplit'
import type { ShareRow } from './transactionShares'

const evenly: ShareRow[] = [
  { member_id: 'earth', share_amount: 900 },
  { member_id: 'ploy', share_amount: 900 },
]

const sum = (rows: ShareRow[]) => rows.reduce((s, r) => s + r.share_amount, 0)

describe('the split a receipt line inherits', () => {
  it('carries an even split down to each line', () => {
    expect(inheritedSplitFor(evenly, 1200)).toEqual([
      { member_id: 'earth', share_amount: 600 },
      { member_id: 'ploy', share_amount: 600 },
    ])
    expect(inheritedSplitFor(evenly, 300)).toEqual([
      { member_id: 'earth', share_amount: 150 },
      { member_id: 'ploy', share_amount: 150 },
    ])
  })

  it('keeps an uneven split uneven', () => {
    const uneven: ShareRow[] = [
      { member_id: 'earth', share_amount: 1260 },
      { member_id: 'ploy', share_amount: 540 },
    ]
    expect(inheritedSplitFor(uneven, 1000)).toEqual([
      { member_id: 'earth', share_amount: 700 },
      { member_id: 'ploy', share_amount: 300 },
    ])
  })

  // The deferred sum check (0022) judges each line at commit: shares that do
  // not add up to their own line abort the whole split.
  it('adds up to the line exactly, however the cents fall', () => {
    for (const amount of [0.01, 0.03, 33.33, 1000.01, 7.77]) {
      expect(sum(inheritedSplitFor(evenly, amount))).toBeCloseTo(amount, 10)
    }
  })

  it('leaves a personal transaction personal — no shares in, none out', () => {
    expect(inheritedSplitFor([], 500)).toEqual([])
  })

  it('has nothing to divide when a line is worth nothing', () => {
    expect(inheritedSplitFor(evenly, 0)).toEqual([])
  })
})
