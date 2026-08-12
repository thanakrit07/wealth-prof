import { describe, expect, it } from 'vitest'
import { normalizeName, parseAmount, parseBool, parseDate, parseDay, parseInteger } from './values'

describe('parseAmount', () => {
  it('parses a plain number', () => {
    expect(parseAmount('250')).toBe(250)
  })
  it('strips baht sign and thousands separators', () => {
    expect(parseAmount('฿1,234.50')).toBe(1234.5)
  })
  it('returns null for blank', () => {
    expect(parseAmount('  ')).toBeNull()
  })
  it('returns null for unparseable text', () => {
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('parseDate', () => {
  it('accepts yyyy-mm-dd regardless of format', () => {
    expect(parseDate('2026-01-05', 'dmy')).toBe('2026-01-05')
    expect(parseDate('2026-01-05', 'mdy')).toBe('2026-01-05')
  })
  it('reads d/m/yyyy under dmy', () => {
    expect(parseDate('5/1/2026', 'dmy')).toBe('2026-01-05')
  })
  it('reads m/d/yyyy under mdy', () => {
    expect(parseDate('1/5/2026', 'mdy')).toBe('2026-01-05')
  })
  it('expands a 2-digit year to 20xx', () => {
    expect(parseDate('5/1/26', 'dmy')).toBe('2026-01-05')
  })
  it('rejects an out-of-range day', () => {
    expect(parseDate('32/1/2026', 'dmy')).toBeNull()
  })
  it('rejects an out-of-range month', () => {
    expect(parseDate('13/1/2026', 'mdy')).toBeNull()
  })
  it('rejects a slash date under ymd format (never unambiguous as ymd)', () => {
    expect(parseDate('5/1/2026', 'ymd')).toBeNull()
  })
  it('returns null for blank', () => {
    expect(parseDate('', 'dmy')).toBeNull()
  })
})

describe('parseDay', () => {
  it('accepts 1-31', () => {
    expect(parseDay('1')).toBe(1)
    expect(parseDay('31')).toBe(31)
  })
  it('rejects 0 and 32 — no clamp-to-1 fallback', () => {
    expect(parseDay('0')).toBeNull()
    expect(parseDay('32')).toBeNull()
  })
  it('rejects non-numeric input', () => {
    expect(parseDay('abc')).toBeNull()
  })
})

describe('parseInteger', () => {
  it('accepts a whole number', () => {
    expect(parseInteger('10')).toBe(10)
  })
  it('rejects a decimal', () => {
    expect(parseInteger('10.5')).toBeNull()
  })
})

describe('parseBool', () => {
  it('recognises yes/no and true/false', () => {
    expect(parseBool('yes', false)).toBe(true)
    expect(parseBool('No', true)).toBe(false)
    expect(parseBool('true', false)).toBe(true)
  })
  it('falls back on blank', () => {
    expect(parseBool('', true)).toBe(true)
    expect(parseBool('', false)).toBe(false)
  })
})

describe('normalizeName', () => {
  it('trims and lowercases', () => {
    expect(normalizeName('  Netflix  ')).toBe('netflix')
  })
})
