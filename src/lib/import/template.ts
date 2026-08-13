import { FIELD_SPECS } from './fields'
import type { EntityKind } from './types'

// Two example rows: a fully-filled one, and a second showing a different
// shape (for transactions, a card bill payment) or simply which optional
// columns can be left blank.
//
// `required` alone can't decide the second row's contents: several fields
// are `required: false` here yet still rejected by validate.ts depending on
// another column — Category is required unless Kind is transfer, Day of
// month is required when Frequency is monthly. Deriving row 2 from the flag
// shipped two templates whose own example row failed validation the moment
// it was imported, so any such field states its row-2 value explicitly.
function secondExampleValue(field: { required: boolean; example: string; example2?: string }): string {
  return field.example2 ?? (field.required ? field.example : '')
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function csvLine(values: string[]): string {
  return values.map(csvCell).join(',')
}

export function buildTemplateCsv(entity: EntityKind): string {
  const fields = FIELD_SPECS[entity]
  const header = csvLine(fields.map((f) => f.column))
  const row1 = csvLine(fields.map((f) => f.example))
  const row2 = csvLine(fields.map((f) => secondExampleValue(f)))
  return [header, row1, row2].join('\n') + '\n'
}

export function templateHeaders(entity: EntityKind): string[] {
  return FIELD_SPECS[entity].map((f) => f.column)
}
