import ExcelJS from 'exceljs'
import { ENTITY_LABELS } from './fields'
import { LISTS_SHEET_NAME } from './templateXlsx'
import { ENTITY_KINDS, type EntityKind } from './types'
import type { ParsedCsv } from './parseCsv'

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

const ENTITY_BY_SHEET_NAME = new Map(ENTITY_KINDS.map((e) => [normalize(ENTITY_LABELS[e]), e]))

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text ?? '')
  if (typeof value === 'object' && 'result' in value) return String((value as { result: unknown }).result ?? '')
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

// Reads every sheet in a workbook whose name matches an entity label
// (case-insensitive — matching buildTemplateWorkbook's own sheet names),
// skipping the hidden Lists helper sheet and any sheet that doesn't match
// an entity at all. One workbook can therefore populate several entities
// at once — the point of offering an xlsx template over one CSV per
// entity — while the plain single-CSV-per-entity path (parseCsvText)
// keeps working unchanged for anyone who'd rather not use Excel/Sheets.
export async function parseXlsxFile(buffer: ArrayBuffer): Promise<Partial<Record<EntityKind, ParsedCsv>>> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const out: Partial<Record<EntityKind, ParsedCsv>> = {}
  for (const sheet of workbook.worksheets) {
    if (normalize(sheet.name) === normalize(LISTS_SHEET_NAME)) continue
    const entity = ENTITY_BY_SHEET_NAME.get(normalize(sheet.name))
    if (!entity) continue

    const headerRow = sheet.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(cellText(cell.value))
    })
    if (headers.length === 0) continue

    const rows: Record<string, string>[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const values = headers.map((_, i) => cellText(row.getCell(i + 1).value))
      if (values.every((v) => !v.trim())) continue // the template's own blank dropdown-validated rows
      rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i]])))
    }
    out[entity] = { headers, rows }
  }
  return out
}
