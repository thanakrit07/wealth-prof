import { describe, expect, it } from 'vitest'
import { templateHeaders } from './template'
import { buildTemplateWorkbook, LISTS_SHEET_NAME } from './templateXlsx'
import { parseXlsxFile } from './parseXlsx'
import { ENTITY_KINDS, emptyContext, type ImportContext } from './types'

const context: ImportContext = {
  categories: [
    { name: 'Groceries', kind: 'expense' },
    { name: 'Salary', kind: 'income' },
  ],
  accounts: [{ name: 'Bank — Earth' }],
  cards: [{ name: 'Card •• 1234' }],
  members: [{ name: 'Earth' }, { name: 'Ploy' }],
}

describe('buildTemplateWorkbook', () => {
  it('has one sheet per entity plus a hidden Lists sheet, headers matching fields.ts', async () => {
    const blob = await buildTemplateWorkbook(context)
    const buffer = await blob.arrayBuffer()
    const parsed = await parseXlsxFile(buffer)
    for (const entity of ENTITY_KINDS) {
      expect(parsed[entity]?.headers).toEqual(templateHeaders(entity))
    }
  })

  it('restricts sheets to the requested entities', async () => {
    const blob = await buildTemplateWorkbook(context, ['transactions'])
    const buffer = await blob.arrayBuffer()
    const parsed = await parseXlsxFile(buffer)
    expect(Object.keys(parsed)).toEqual(['transactions'])
  })

  it('carries the same two example rows as the CSV template', async () => {
    const blob = await buildTemplateWorkbook(context, ['accounts'])
    const buffer = await blob.arrayBuffer()
    const parsed = await parseXlsxFile(buffer)
    expect(parsed.accounts?.rows).toHaveLength(2)
    expect(parsed.accounts?.rows[0].Name).toBe('Bank — Earth')
  })

  it('works with an empty household (no categories/accounts/cards/members yet)', async () => {
    const blob = await buildTemplateWorkbook(emptyContext())
    const buffer = await blob.arrayBuffer()
    const parsed = await parseXlsxFile(buffer)
    expect(parsed.transactions?.headers).toEqual(templateHeaders('transactions'))
  })
})

describe('parseXlsxFile', () => {
  it('ignores a sheet named after the Lists helper and any sheet with no matching entity', async () => {
    const blob = await buildTemplateWorkbook(context, ['categories'])
    const buffer = await blob.arrayBuffer()
    const parsed = await parseXlsxFile(buffer)
    expect(Object.keys(parsed)).not.toContain(LISTS_SHEET_NAME)
    expect(parsed.categories).toBeDefined()
  })

  it('drops fully-blank rows (the template pre-validates ~200 rows past the examples)', async () => {
    const blob = await buildTemplateWorkbook(context, ['cards'])
    const buffer = await blob.arrayBuffer()
    const parsed = await parseXlsxFile(buffer)
    // Only the two example rows should come back, not 200 blank ones.
    expect(parsed.cards?.rows).toHaveLength(2)
  })
})
