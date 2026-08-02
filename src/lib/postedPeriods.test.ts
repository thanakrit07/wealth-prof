import { describe, expect, it } from 'vitest'
import { toPostedPeriods, type PostedPeriodsData } from './installments'

// Regression: this query's data used to be built as a Set and a Map inside the
// queryFn. React Query persists query data to localStorage as JSON, and both
// stringify to `{}` — so after any reload the Plan tab crashed with
// "postedPeriods.has is not a function". The queryFn now returns a plain
// object and the Set/Map are rebuilt per observer by `select`. Same trap, and
// same fix, as categoryUsage.test.ts.
describe('posted periods data', () => {
  const sample: PostedPeriodsData = {
    'inst-1:1': 'txn-a',
    'inst-1:2': 'txn-b',
    'inst-2:1': 'txn-c',
  }

  it('survives a JSON round-trip, which is what persistence does to it', () => {
    expect(JSON.parse(JSON.stringify(sample))).toEqual(sample)
  })

  it('rebuilds a working Set and Map from round-tripped data', () => {
    const restored = toPostedPeriods(JSON.parse(JSON.stringify(sample)) as PostedPeriodsData)
    expect(restored.keys.has('inst-1:2')).toBe(true)
    expect(restored.keys.has('inst-9:9')).toBe(false)
    expect(restored.transactionIdByKey.get('inst-2:1')).toBe('txn-c')
  })

  it('returns an empty Set rather than throwing when nothing is posted', () => {
    const empty = toPostedPeriods({})
    expect(empty.keys.size).toBe(0)
    // cycleBill calls .has on this every render; it must never throw.
    expect(empty.keys.has('inst-1:1')).toBe(false)
  })
})
