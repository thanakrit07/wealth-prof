import ExcelJS from 'exceljs'
import { ENTITY_LABELS, FIELD_SPECS, type FieldSpec } from './fields'
import { ENTITY_KINDS, type EntityKind, type ImportContext } from './types'

// The name reserved for the hidden helper sheet holding option lists —
// checked by parseXlsx.ts so it's never mistaken for an entity sheet.
export const LISTS_SHEET_NAME = 'Lists'

const DATA_ROWS = 200 // headroom below the header for dropdown validation

// One workbook, one sheet per entity, matching the same header order and
// example rows as buildTemplateCsv (template.test.ts pins both against
// fields.ts) — plus real dropdown lists for enum and reference fields,
// which a plain CSV template can't carry. Reference-field lists (category,
// account/card, member) come from the household's own data at download
// time, so they're frozen to what existed then — a category added in this
// same workbook's own Categories sheet won't appear in another sheet's
// dropdown, which is why every list validation is a soft warning rather
// than a hard block (errorStyle: 'warning'): typing a value outside the
// list must stay possible, buildPlan() is still the real judge of whether
// a name resolves.
export async function buildTemplateWorkbook(context: ImportContext, entities: readonly EntityKind[] = ENTITY_KINDS): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()

  const expenseCategories = context.categories.filter((c) => c.kind === 'expense').map((c) => c.name)
  const incomeCategories = context.categories.filter((c) => c.kind === 'income').map((c) => c.name)
  const allCategories = [...new Set([...expenseCategories, ...incomeCategories])]
  const instruments = [...new Set([...context.accounts.map((a) => a.name), ...context.cards.map((c) => c.name)])]
  const memberNames = context.members.map((m) => m.name)

  const lists = workbook.addWorksheet(LISTS_SHEET_NAME, { state: 'veryHidden' })
  const listColumn = (col: number, header: string, values: string[]) => {
    lists.getCell(1, col).value = header
    values.forEach((v, i) => {
      lists.getCell(i + 2, col).value = v
    })
  }
  listColumn(1, 'ExpenseCategories', expenseCategories)
  listColumn(2, 'AllCategories', allCategories)
  listColumn(3, 'Instruments', instruments)
  listColumn(4, 'Members', memberNames)

  function listRef(col: number, count: number): string {
    // A one-row range when the household has nothing yet — Excel/Sheets
    // both accept a range referencing a single blank cell as "no options"
    // rather than erroring.
    const last = Math.max(count + 1, 2)
    const colLetter = String.fromCharCode('A'.charCodeAt(0) + col - 1)
    return `${LISTS_SHEET_NAME}!$${colLetter}$2:$${colLetter}$${last}`
  }

  const referenceRanges: Record<FieldSpec['type'], string | null> = {
    text: null,
    number: null,
    day: null,
    integer: null,
    date: null,
    bool: '"yes,no"',
    enum: null, // resolved per-field below (enumValues)
    'category-ref': listRef(2, allCategories.length),
    'instrument-ref': listRef(3, instruments.length),
    'member-ref': listRef(4, memberNames.length),
  }

  for (const entity of entities) {
    const fields = FIELD_SPECS[entity]
    const sheet = workbook.addWorksheet(ENTITY_LABELS[entity])
    sheet.columns = fields.map((f) => ({ header: f.column, key: f.key, width: Math.max(14, f.column.length + 2) }))
    sheet.getRow(1).font = { bold: true }
    sheet.addRow(Object.fromEntries(fields.map((f) => [f.key, f.example])))
    sheet.addRow(Object.fromEntries(fields.map((f) => [f.key, f.required ? f.example : ''])))

    fields.forEach((field, colIndex) => {
      const col = colIndex + 1
      const formula = field.type === 'enum' ? (field.enumValues ? `"${field.enumValues.join(',')}"` : null) : referenceRanges[field.type]
      // installments.category is always expense (materialiseInstallmentsDue
      // hardcodes kind: 'expense'), so it gets the narrower list even
      // though its FieldSpec type is the same 'category-ref' every other
      // category column uses.
      const resolvedFormula = entity === 'installments' && field.key === 'category' ? listRef(1, expenseCategories.length) : formula
      if (!resolvedFormula) return
      for (let row = 2; row <= DATA_ROWS + 1; row++) {
        sheet.getCell(row, col).dataValidation = {
          type: 'list',
          allowBlank: !field.required,
          formulae: [resolvedFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Not in the list',
          error: 'This value isn’t one of the suggested options — that’s fine if you just added it elsewhere in this file, but double check the spelling.',
        }
      }
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
