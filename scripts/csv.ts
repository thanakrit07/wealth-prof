import { readFileSync } from 'node:fs'
import { parse } from 'csv-parse/sync'

export type CsvRow = Record<string, string>

export function readCsv(path: string): CsvRow[] {
  const content = readFileSync(path, 'utf-8')
  return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[]
}

// The real sheet's column headers aren't known ahead of time, so each
// field tries several plausible spellings (English + Thai) case- and
// whitespace-insensitively. Update these candidate lists once the actual
// CSV headers are known — see scripts/README.md.
export function pick(row: CsvRow, candidates: string[]): string {
  const normalized = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]))
  for (const candidate of candidates) {
    const value = normalized.get(candidate.trim().toLowerCase())
    if (value != null && value !== '') return value
  }
  return ''
}

export function parseNumber(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/[,฿\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

// Accepts d/m/yyyy, yyyy-mm-dd, m/d/yyyy — whichever the sheet exports.
export function parseDate(value: string): string | null {
  if (!value) return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value.trim())
  if (slash) {
    let [, a, b, year] = slash
    if (year.length === 2) year = `20${year}`
    // Ambiguous d/m vs m/d — DESIGN.md assumes Thai-authored sheet (d/m/yyyy).
    const day = a.padStart(2, '0')
    const month = b.padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return null
}
