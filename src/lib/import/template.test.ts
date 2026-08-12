import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENTITY_KINDS } from './types'
import { templateHeaders } from './template'

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

describe('import templates match fields.ts', () => {
  for (const entity of ENTITY_KINDS) {
    it(`docs/import-templates/${FILE_NAMES[entity]} header matches FIELD_SPECS`, () => {
      const path = `${import.meta.dirname}/../../../docs/import-templates/${FILE_NAMES[entity]}`
      const content = readFileSync(path, 'utf-8')
      const headerLine = content.split('\n')[0]
      expect(headerLine.split(',')).toEqual(templateHeaders(entity))
    })
  }
})
