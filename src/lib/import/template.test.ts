import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectMapping } from './detect'
import { FIELD_SPECS } from './fields'
import { parseCsvText } from './parseCsv'
import { buildPlan } from './plan'
import { buildTemplateCsv, templateHeaders } from './template'
import { emptyRowEdits, ENTITY_KINDS, type EntityKind, type ImportContext } from './types'

// Guards against fields.ts drifting from docs/import-templates/*.csv: add a
// field, forget to regenerate the template, and this goes red instead of
// the app quietly guiding users toward a header the code doesn't expect.
const FILE_NAMES: Record<string, string> = {
  categories: 'categories.csv',
  accounts: 'accounts.csv',
  cards: 'cards.csv',
  installments: 'installments.csv',
  recurringRules: 'recurring-rules.csv',
  transactions: 'transactions.csv',
}

function templatePath(entity: EntityKind): string {
  return `${import.meta.dirname}/../../../docs/import-templates/${FILE_NAMES[entity]}`
}

describe('import templates match fields.ts', () => {
  for (const entity of ENTITY_KINDS) {
    it(`docs/import-templates/${FILE_NAMES[entity]} header matches FIELD_SPECS`, () => {
      const headerLine = readFileSync(templatePath(entity), 'utf-8').split('\n')[0]
      expect(headerLine.split(',')).toEqual(templateHeaders(entity))
    })

    it(`docs/import-templates/${FILE_NAMES[entity]} content matches buildTemplateCsv`, () => {
      expect(readFileSync(templatePath(entity), 'utf-8')).toEqual(buildTemplateCsv(entity))
    })
  }
})

// Every name the example rows reference, so the templates are judged on
// their own shape rather than on whether this household happens to have a
// category called "Groceries".
const context: ImportContext = {
  categories: [
    { name: 'Groceries', kind: 'expense' },
    { name: 'Electronics', kind: 'expense' },
    { name: 'Subscriptions', kind: 'expense' },
  ],
  accounts: [{ name: 'Bank — Earth' }],
  cards: [{ name: 'Card •• 1234' }],
  members: [{ name: 'Earth' }],
}

// The bug this pins: row 2 used to be derived from `required` alone, which
// can't see that Category is required unless Kind is transfer, or that Day
// of month is required when Frequency is monthly. Both the transactions and
// recurring-rules templates therefore shipped a second example row that
// failed validation the moment anyone imported the file as downloaded.
describe('every template example row is itself importable', () => {
  for (const entity of ENTITY_KINDS) {
    it(`${FILE_NAMES[entity]} example rows produce no errors`, () => {
      const parsed = parseCsvText(buildTemplateCsv(entity))
      const mapping = detectMapping(parsed.headers, FIELD_SPECS[entity])
      const plan = buildPlan(
        { [entity]: { headers: parsed.headers, rows: parsed.rows, mapping } },
        emptyRowEdits(),
        context,
        'dmy',
        '2026-08-13',
      )
      expect(plan.issues.filter((i) => i.severity === 'error')).toEqual([])
      expect(plan[entity].every((r) => r.value !== null)).toBe(true)
    })
  }
})

describe('the transactions template demonstrates a card bill payment', () => {
  it('second row is a transfer to a card with no category', () => {
    const parsed = parseCsvText(buildTemplateCsv('transactions'))
    const row = parsed.rows[1]
    expect(row.Kind).toBe('transfer')
    expect(row.Category).toBe('')
    expect(row['To account or card']).toBe('Card •• 1234')
    expect(row['Account or card']).toBe('Bank — Earth')
  })
})
