import type { DateFormat } from './types'

// Ported from scripts/csv.ts, now with tests and an explicit date format
// instead of a guess. csv.ts's parseDate silently assumed d/m/yyyy with a
// comment flagging the ambiguity — the in-app screen replaces that guess
// with a mapping-step choice the user makes once per import.

export function parseAmount(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[,฿\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// yyyy-mm-dd is accepted regardless of `format` — it's never ambiguous, so
// treating it as an exception isn't a guess. Only d/m vs m/d slash dates
// consult the chosen format.
export function parseDate(value: string, format: DateFormat): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (iso) {
    const [, y, m, d] = iso
    return isValidDate(Number(y), Number(m), Number(d)) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null
  }

  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed)
  if (!slash) return null
  const [, a, b, yearRaw] = slash
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw
  const [day, month] = format === 'mdy' ? [b, a] : [a, b]
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (format === 'ymd') return null // yyyy-mm-dd already handled above; a plain d/m/y string can't mean ymd
  return isValidDate(y, m, d) ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : null
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

// A day-of-month/statement-day/due-day field: an integer 1-31, no
// clamp-to-1 fallback (the old script's `Number(...) || 1` silently turned
// garbage into the 1st).
export function parseDay(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d{1,2}$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n >= 1 && n <= 31 ? n : null
}

export function parseInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

const TRUE_VALUES = new Set(['true', 'yes', 'y', '1'])
const FALSE_VALUES = new Set(['false', 'no', 'n', '0'])

export function parseBool(value: string, fallback: boolean): boolean {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return fallback
  if (TRUE_VALUES.has(trimmed)) return true
  if (FALSE_VALUES.has(trimmed)) return false
  return fallback
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}
