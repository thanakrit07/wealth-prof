import type { FieldSpec } from './fields'

export type ColumnMapping = Record<string, string | null> // field.key -> csv header (or null = unmapped)

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

// Suggests a mapping for one file's headers against one entity's field
// specs — each field matches the first header whose normalized text equals
// one of the field's aliases. Never guesses across entities and never
// partial-matches (a header containing a candidate substring is not enough
// to auto-map it) — an unmatched field is left null for the user to pick by
// hand rather than mapped to something that merely looks similar.
export function detectMapping(headers: string[], fields: FieldSpec[]): ColumnMapping {
  const byNormalized = new Map(headers.map((h) => [normalize(h), h]))
  const mapping: ColumnMapping = {}
  for (const field of fields) {
    let matched: string | null = null
    for (const alias of field.aliases) {
      const header = byNormalized.get(normalize(alias))
      if (header) {
        matched = header
        break
      }
    }
    mapping[field.key] = matched
  }
  return mapping
}

// Applies a mapping to one CSV row, producing the Record<fieldKey, string>
// that validate.ts consumes. A field with no mapped header (or a header
// missing from this particular row) becomes ''.
export function mapRow(row: Record<string, string>, mapping: ColumnMapping, fields: FieldSpec[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of fields) {
    const header = mapping[field.key]
    out[field.key] = header ? (row[header] ?? '') : ''
  }
  return out
}
