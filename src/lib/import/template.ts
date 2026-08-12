import { FIELD_SPECS } from './fields'
import type { EntityKind } from './types'

// Two example rows: a fully-filled one, and a minimal one showing that
// optional fields can be left blank. Both use the same required values —
// swapping an enum on its own (e.g. Kind) without changing the fields that
// depend on it (Category, schedule fields) would produce a row that looks
// like a real example but isn't a legal one.
function secondExampleValue(field: { required: boolean; example: string }): string {
  return field.required ? field.example : ''
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
