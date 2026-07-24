import { describe, expect, it } from 'vitest'
import { formatBaht } from './format'

describe('formatBaht', () => {
  it('formats with thousands separators and two decimal places', () => {
    expect(formatBaht(1234.5)).toBe('1,234.50')
  })

  it('pads whole numbers to two decimal places', () => {
    expect(formatBaht(65)).toBe('65.00')
  })
})
