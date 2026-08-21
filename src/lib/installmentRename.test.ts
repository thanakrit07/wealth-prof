import { describe, expect, it } from 'vitest'
import { periodNote, periodsToRename, type PostedPeriodNote } from './installmentMaterialiser'

// D15 as amended in v4.3: a plan is still immutable in every way that involves
// money, but its *name* propagates to the periods already posted — and only to
// the ones still carrying the label the plan gave them.
describe('periodsToRename', () => {
  const id = 'inst-1'
  const previous = { name: 'Notebook', totalPeriods: 3 }
  const rows = (): PostedPeriodNote[] => [
    { id: 'txn-1', source_key: `installment:${id}:1`, note: periodNote('Notebook', 1, 3) },
    { id: 'txn-2', source_key: `installment:${id}:2`, note: periodNote('Notebook', 2, 3) },
    { id: 'txn-3', source_key: `installment:${id}:3`, note: periodNote('Notebook', 3, 3) },
  ]

  it('rewrites every period, settled or not — the ledger cannot hold two names for one debt', () => {
    const updates = periodsToRename(rows(), id, previous, { name: 'MacBook', totalPeriods: 3 })
    expect(updates).toEqual([
      { id: 'txn-1', note: 'MacBook (งวดที่ 1/3)' },
      { id: 'txn-2', note: 'MacBook (งวดที่ 2/3)' },
      { id: 'txn-3', note: 'MacBook (งวดที่ 3/3)' },
    ])
  })

  it('leaves a hand-edited note alone, which is the whole guard', () => {
    const withEdit = rows()
    withEdit[1] = { ...withEdit[1], note: 'Notebook — the one I returned' }
    const updates = periodsToRename(withEdit, id, previous, { name: 'MacBook', totalPeriods: 3 })
    expect(updates.map((u) => u.id)).toEqual(['txn-1', 'txn-3'])
  })

  it('recognises the old label by the count it was posted with, not the new one', () => {
    // Renaming and lengthening in one save: the rows on screen still say /3.
    const updates = periodsToRename(rows(), id, previous, { name: 'MacBook', totalPeriods: 5 })
    expect(updates.map((u) => u.note)).toEqual([
      'MacBook (งวดที่ 1/5)',
      'MacBook (งวดที่ 2/5)',
      'MacBook (งวดที่ 3/5)',
    ])
  })

  it('never touches another plan sharing the same query result', () => {
    const mixed = [...rows(), { id: 'txn-x', source_key: 'installment:inst-2:1', note: periodNote('Notebook', 1, 3) }]
    const updates = periodsToRename(mixed, id, previous, { name: 'MacBook', totalPeriods: 3 })
    expect(updates.some((u) => u.id === 'txn-x')).toBe(false)
  })

  it('skips rows that already read correctly, so a no-op save writes nothing', () => {
    expect(periodsToRename(rows(), id, previous, { name: 'Notebook', totalPeriods: 3 })).toEqual([])
  })

  it('ignores a row with no installment source_key rather than throwing', () => {
    const odd: PostedPeriodNote[] = [{ id: 'txn-9', source_key: null, note: 'whatever' }]
    expect(periodsToRename(odd, id, previous, { name: 'MacBook', totalPeriods: 3 })).toEqual([])
  })
})
