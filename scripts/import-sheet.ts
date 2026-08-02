// Import from the old Google Sheet (DESIGN.md §9). Consumes CSV exports
// of four tabs: Accounts, Credit Card, Installment, Transactions.
//
// Usage:
//   npx tsx scripts/import-sheet.ts --dir ./import-data --dry-run   (writes nothing)
//   npx tsx scripts/import-sheet.ts --dir ./import-data
//
// Required env vars (put in .env.local, already used by the app):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Plus, for this script only (not committed — pass at the shell):
//   IMPORT_EMAIL, IMPORT_PASSWORD  (the household member running the import)
//
// Runs as that authenticated user (not a service role), so normal RLS
// applies — it can only write to that user's own household, which is
// exactly the safety property we want for a script a user runs themselves.
//
// Upsert, not wipe (DESIGN.md §9): every row gets source_key = "<tab>:<id>"
// (unique per household, migration 0013); re-running updates matching rows
// and inserts new ones without ever clearing existing data.
//
// --dry-run resolves and validates every row exactly as a real run would,
// reports what it would insert vs update, and writes nothing. Run it first:
// it is the only way to catch a reordered sheet before the upsert overwrites
// the wrong record in place (see `save`).
//
// IMPORTANT: the exact column headers in your CSV exports are not yet
// known. `pick()` (scripts/csv.ts) tries several plausible header
// spellings per field — if a column comes back empty in the summary,
// open the CSV, find its real header, and add it to that field's
// candidate list below.

import { createClient } from '@supabase/supabase-js'
import { parseInterestRate } from './interestRate.ts'
import { parseDate, parseNumber, pick, readCsv, type CsvRow } from './csv.ts'
import { periodDate } from '../src/lib/finance/billingCycle.ts'

interface Args {
  dir: string
  dryRun: boolean
}

function parseArgs(): Args {
  const dirFlagIndex = process.argv.indexOf('--dir')
  const dir = dirFlagIndex >= 0 ? process.argv[dirFlagIndex + 1] : './import-data'
  return { dir, dryRun: process.argv.includes('--dry-run') }
}

async function main() {
  const { dir, dryRun } = parseArgs()
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const email = process.env.IMPORT_EMAIL
  const password = process.env.IMPORT_PASSWORD
  if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  if (!email || !password) throw new Error('Missing IMPORT_EMAIL / IMPORT_PASSWORD env vars')

  const supabase = createClient(url, anonKey)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) throw authError
  const userId = authData.user.id

  const { data: self, error: selfError } = await supabase
    .from('household_members')
    .select('id, household_id, display_name')
    .eq('user_id', userId)
    .single()
  if (selfError) throw selfError
  const householdId = self.household_id as string

  const { data: members } = await supabase
    .from('household_members')
    .select('id, display_name')
    .eq('household_id', householdId)
  const memberByName = new Map((members ?? []).map((m) => [m.display_name.trim().toLowerCase(), m.id as string]))

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .eq('household_id', householdId)
  const categoryByName = new Map((categories ?? []).map((c) => [`${c.kind}:${c.name.trim().toLowerCase()}`, c.id as string]))

  const summary = {
    accounts: { ok: 0, failed: 0 },
    cards: { ok: 0, failed: 0 },
    installments: { ok: 0, failed: 0, payments: 0 },
    transactions: { ok: 0, failed: 0 },
    failures: [] as string[],
    inserts: 0,
    updates: 0,
    /** Things that will import "successfully" but not mean what you wanted. */
    warnings: [] as string[],
  }

  // What source_keys already exist, so a dry run can say insert vs update —
  // and, more importantly, catch a source_key whose meaning has shifted.
  async function existingByKey(table: string, nameColumn: string) {
    const { data } = await supabase
      .from(table)
      .select(`id, source_key, ${nameColumn}`)
      .eq('household_id', householdId)
      .not('source_key', 'is', null)
    const map = new Map<string, { id: string; name: string }>()
    // Cast via unknown: the select list is built at runtime, so supabase-js
    // cannot infer a row type from it.
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      map.set(row.source_key as string, { id: row.id as string, name: String(row[nameColumn] ?? '') })
    }
    return map
  }

  const existing = {
    accounts: await existingByKey('accounts', 'name'),
    cards: await existingByKey('cards', 'name'),
    installments: await existingByKey('installments', 'name'),
    // note, not description: since 0020 note is the primary label the
    // ledger shows, and description holds only secondary detail (often
    // empty) — using description here would starve the REORDERED guard of
    // a real name to compare against.
    transactions: await existingByKey('transactions', 'note'),
  }

  /**
   * Writes the row, or in a dry run reports what the write would do.
   *
   * source_key is the CSV row *index*, so it only keeps meaning while row
   * order does. If a key already belongs to a differently-named record, the
   * sheet has been reordered and this upsert would overwrite the wrong row
   * in place — same id, so everything stays linked to it while its identity
   * silently changes. That is the loudest thing a dry run can tell you.
   */
  async function save(
    table: keyof typeof existing,
    sourceKey: string,
    row: Record<string, unknown>,
    incomingName: string,
  ): Promise<string> {
    const prior = existing[table].get(sourceKey)
    if (prior && incomingName && prior.name && prior.name.trim().toLowerCase() !== incomingName.trim().toLowerCase()) {
      summary.warnings.push(
        `REORDERED: ${table} "${sourceKey}" is currently "${prior.name}" but this row is "${incomingName}" — ` +
          `re-running would overwrite the existing record in place. Restore the sheet's original row order.`,
      )
    }
    if (prior) summary.updates++
    else summary.inserts++

    if (dryRun) return prior?.id ?? `dry:${sourceKey}`

    const { data, error } = await supabase
      .from(table)
      .upsert(row, { onConflict: 'household_id,source_key' })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  function resolveOwner(name: string): string | null {
    if (!name) return null
    return memberByName.get(name.trim().toLowerCase()) ?? null
  }

  function resolveCategory(name: string, kind: 'income' | 'expense'): string | null {
    if (!name) return null
    return categoryByName.get(`${kind}:${name.trim().toLowerCase()}`) ?? null
  }

  // --- Accounts -----------------------------------------------------
  const accountIdByName = new Map<string, string>()
  try {
    const rows = readCsv(`${dir}/accounts.csv`)
    for (const [i, row] of rows.entries()) {
      const sourceKey = `accounts:${i}`
      try {
        const name = pick(row, ['name', 'ชื่อ', 'account', 'account name'])
        const typeRaw = pick(row, ['type', 'ประเภท']).toLowerCase()
        const type = typeRaw.includes('cash') || typeRaw.includes('เงินสด') ? 'cash' : typeRaw.includes('wallet') ? 'ewallet' : 'bank'
        const owner = resolveOwner(pick(row, ['owner', 'เจ้าของ', 'person']))
        const balance = parseNumber(pick(row, ['balance', 'ยอดคงเหลือ', 'current balance']))
        if (!name) throw new Error('missing name')

        if (existing.accounts.has(sourceKey)) {
          summary.warnings.push(
            `accounts "${name}": re-importing resets the balance anchor to ${balance} dated today, ` +
              `discarding any reconciliation. Skip accounts.csv unless that is what you want.`,
          )
        }
        const id = await save(
          'accounts',
          sourceKey,
          {
            household_id: householdId,
            source_key: sourceKey,
            name,
            type,
            owner_id: owner,
            anchor_balance: balance,
            anchor_date: new Date().toISOString().slice(0, 10),
          },
          name,
        )
        accountIdByName.set(name.trim().toLowerCase(), id)
        summary.accounts.ok++
      } catch (err) {
        summary.accounts.failed++
        summary.failures.push(`accounts row ${i}: ${(err as Error).message}`)
      }
    }
  } catch (err) {
    console.warn(`Skipping accounts.csv: ${(err as Error).message}`)
  }

  // --- Credit cards ---------------------------------------------------
  const cardIdBySourceKey = new Map<string, string>()
  const cardIdByName = new Map<string, string>()
  try {
    const rows = readCsv(`${dir}/credit-card.csv`)
    for (const [i, row] of rows.entries()) {
      const sourceKey = `credit-card:${i}`
      try {
        const name = pick(row, ['name', 'card', 'card name', 'ชื่อบัตร'])
        const creditLimit = parseNumber(pick(row, ['limit', 'credit limit', 'วงเงิน']))
        const statementDay = Number(pick(row, ['statement day', 'statement', 'วันสรุปยอด'])) || 1
        const dueDay = Number(pick(row, ['due day', 'due', 'วันครบกำหนด'])) || 1
        const rateNote = pick(row, ['interest rate', 'rate', 'ดอกเบี้ย'])
        const { annualRate } = parseInterestRate(rateNote || '0%')
        const owner = resolveOwner(pick(row, ['owner', 'เจ้าของ', 'person']))
        if (!name) throw new Error('missing name')

        const id = await save(
          'cards',
          sourceKey,
          {
            household_id: householdId,
            source_key: sourceKey,
            name,
            credit_limit: creditLimit,
            statement_day: statementDay,
            due_day: dueDay,
            annual_interest_rate: annualRate,
            owner_id: owner,
          },
          name,
        )
        cardIdBySourceKey.set(sourceKey, id)
        cardIdByName.set(name.trim().toLowerCase(), id)
        summary.cards.ok++
      } catch (err) {
        summary.cards.failed++
        summary.failures.push(`credit-card row ${i}: ${(err as Error).message}`)
      }
    }
  } catch (err) {
    console.warn(`Skipping credit-card.csv: ${(err as Error).message}`)
  }

  function resolveInstrument(nameOrKey: string): { accountId: string | null; cardId: string | null } {
    const key = nameOrKey.trim().toLowerCase()
    const cardId = cardIdByName.get(key)
    if (cardId) return { accountId: null, cardId }
    const accountId = accountIdByName.get(key)
    if (accountId) return { accountId, cardId: null }
    return { accountId: null, cardId: null }
  }

  // --- Installments -----------------------------------------------------
  const suggestedRecurring: CsvRow[] = []
  // Every active plan's periods are posted as transactions by the app itself,
  // so the same charge appearing in transactions.csv is a duplicate under a
  // different source_key — nothing dedupes it. Collected here to check for.
  const installmentNames: string[] = []
  try {
    const rows = readCsv(`${dir}/installment.csv`)
    for (const [i, row] of rows.entries()) {
      const sourceKey = `installment:${i}`
      try {
        const name = pick(row, ['name', 'ชื่อรายการ', 'item'])
        const startDate = parseDate(pick(row, ['start date', 'วันที่เริ่ม']))
        const totalPeriods = Number(pick(row, ['total periods', 'periods', 'งวด', 'จำนวนงวด']))
        const monthlyAmount = parseNumber(pick(row, ['monthly amount', 'amount per period', 'ยอดผ่อนต่องวด']))
        const periodsPaid = Number(pick(row, ['periods paid', 'paid', 'จ่ายแล้ว'])) || 0
        const note = pick(row, ['note', 'หมายเหตุ'])
        const { annualRate, isCashAdvance } = parseInterestRate(note)
        const instrumentName = pick(row, ['account', 'card', 'paying account', 'บัญชี/บัตร'])
        const instrument = resolveInstrument(instrumentName)
        const owner = resolveOwner(pick(row, ['owner', 'เจ้าของ', 'person']))
        const categoryId = resolveCategory(pick(row, ['category', 'หมวดหมู่']), 'expense')

        if (!name || !startDate || !totalPeriods || !monthlyAmount) throw new Error('missing required field')
        if (!instrument.accountId && !instrument.cardId) throw new Error(`unresolved instrument "${instrumentName}"`)

        // No category means the plan imports looking fine and then never
        // posts a period: the materialiser skips it, because an expense with
        // no category violates transactions' category_iff_not_transfer check.
        if (!categoryId) {
          summary.warnings.push(
            `installment "${name}": no category matched — the plan will import but none of its ` +
              `${totalPeriods} periods will ever post. Set a category that exists, or fix it in the app after.`,
          )
        }
        installmentNames.push(name)

        const id = await save(
          'installments',
          sourceKey,
          {
            household_id: householdId,
            source_key: sourceKey,
            name,
            category_id: categoryId,
            start_date: startDate,
            total_periods: totalPeriods,
            monthly_amount: monthlyAmount,
            account_id: instrument.accountId,
            card_id: instrument.cardId,
            annual_interest_rate: annualRate,
            is_cash_advance: isCashAdvance,
            owner_id: owner,
            note: note || null,
            status: periodsPaid >= totalPeriods ? 'done' : 'active',
          },
          name,
        )
        summary.installments.ok++

        for (let periodNo = 1; periodNo <= periodsPaid; periodNo++) {
          const paidDate = periodDate(startDate, periodNo)
          if (dryRun) {
            summary.installments.payments++
            continue
          }
          const { error: paymentError } = await supabase
            .from('installment_payments')
            .upsert(
              { household_id: householdId, installment_id: id, period_no: periodNo, paid_date: paidDate },
              { onConflict: 'installment_id,period_no' },
            )
          if (!paymentError) summary.installments.payments++
        }
      } catch (err) {
        summary.installments.failed++
        summary.failures.push(`installment row ${i}: ${(err as Error).message}`)
      }
    }
  } catch (err) {
    console.warn(`Skipping installment.csv: ${(err as Error).message}`)
  }

  // --- Transactions -----------------------------------------------------
  try {
    const rows = readCsv(`${dir}/transactions.csv`)
    for (const [i, row] of rows.entries()) {
      const sourceKey = `transactions:${i}`
      try {
        const date = parseDate(pick(row, ['date', 'transaction date', 'วันที่']))
        // "label" because this CSV cell becomes the DB's `note` column — the
        // sheet's user-facing detail is the ledger's primary label (0020).
        const label = pick(row, ['description', 'รายละเอียด', 'note'])
        const incomeAmount = parseNumber(pick(row, ['income', 'income amount', 'รายรับ']))
        const expenseAmount = parseNumber(pick(row, ['expense', 'expense amount', 'รายจ่าย']))
        const accountName = pick(row, ['account', 'บัญชี'])
        const owner = resolveOwner(pick(row, ['owner', 'person', 'เจ้าของ']))
        const categoryName = pick(row, ['category', 'หมวดหมู่'])
        const instrument = resolveInstrument(accountName)
        if (!date) throw new Error('missing/unparseable date')
        if (!instrument.accountId && !instrument.cardId) throw new Error(`unresolved instrument "${accountName}"`)

        // D7: a payment against a card is a transfer, not an expense —
        // otherwise it double-counts against the card's own purchases.
        const looksLikeCardPayment =
          /จ่ายบัตร|payment|ชำระ/i.test(label) && cardIdByName.has(categoryName.trim().toLowerCase())

        const kind = looksLikeCardPayment ? 'transfer' : incomeAmount > 0 ? 'income' : 'expense'
        const amount = kind === 'income' ? incomeAmount : expenseAmount || incomeAmount

        const row_: Record<string, unknown> = {
          household_id: householdId,
          source_key: sourceKey,
          source: 'import',
          date,
          kind,
          note: label || null,
          amount,
          owner_id: owner,
          from_account_id: instrument.accountId,
          from_card_id: instrument.cardId,
        }
        if (kind !== 'transfer') {
          // Sheet rows left without a category still need one (category_id is
          // required for income/expense); fall back to "Other" rather than
          // dropping a real transaction, and let the user re-tag it later.
          row_.category_id = resolveCategory(categoryName, kind as 'income' | 'expense') ?? resolveCategory('Other', kind as 'income' | 'expense')
          row_.category_kind = kind
        } else {
          const toCardId = cardIdByName.get(categoryName.trim().toLowerCase()) ?? null
          row_.to_card_id = toCardId
        }

        if (kind !== 'transfer' && categoryName && !resolveCategory(categoryName, kind as 'income' | 'expense')) {
          summary.warnings.push(
            `transaction row ${i}: category "${categoryName}" does not exist — it will import silently as "Other".`,
          )
        }
        const clash = installmentNames.find((n) => n && label.toLowerCase().includes(n.toLowerCase()))
        if (clash) {
          summary.warnings.push(
            `transaction row ${i} ("${label}") looks like a period of installment "${clash}", which the app ` +
              `posts by itself — importing it too would double-count the charge. Remove it from transactions.csv.`,
          )
        }

        await save('transactions', sourceKey, row_, label)
        summary.transactions.ok++

        // Flag likely-recurring items for the user to review manually
        // (DESIGN §9 — the import never creates rules silently).
        if (/salary|เงินเดือน|insurance|ประกัน|netflix|subscription/i.test(`${label} ${categoryName}`)) {
          suggestedRecurring.push(row)
        }
      } catch (err) {
        summary.transactions.failed++
        summary.failures.push(`transactions row ${i}: ${(err as Error).message}`)
      }
    }
  } catch (err) {
    console.warn(`Skipping transactions.csv: ${(err as Error).message}`)
  }

  console.log(dryRun ? '\n--- Dry run: nothing was written ---' : '\n--- Import summary ---')
  console.log(`Accounts:      ${summary.accounts.ok} ok, ${summary.accounts.failed} failed`)
  console.log(`Cards:         ${summary.cards.ok} ok, ${summary.cards.failed} failed`)
  console.log(`Installments:  ${summary.installments.ok} ok, ${summary.installments.failed} failed, ${summary.installments.payments} payments recorded`)
  console.log(`Transactions:  ${summary.transactions.ok} ok, ${summary.transactions.failed} failed`)
  console.log(`${dryRun ? 'Would insert' : 'Inserted'}: ${summary.inserts}   ${dryRun ? 'would update' : 'updated'}: ${summary.updates}`)

  if (summary.warnings.length > 0) {
    // Deduplicated: one bad column spelling otherwise repeats per row and
    // buries the one-off warnings that actually need a decision.
    const unique = [...new Set(summary.warnings)]
    console.log(`\n${unique.length} warning(s) — these import "successfully" but not as intended:`)
    for (const w of unique.slice(0, 50)) console.log(`  ! ${w}`)
    if (unique.length > 50) console.log(`  … and ${unique.length - 50} more`)
  }
  if (suggestedRecurring.length > 0) {
    console.log(`\nLikely recurring items found (add as rules manually in Plan → Recurring):`)
    for (const row of suggestedRecurring.slice(0, 20)) {
      console.log(`  - ${JSON.stringify(row)}`)
    }
  }
  if (summary.failures.length > 0) {
    console.log(`\n${summary.failures.length} rows failed to parse:`)
    for (const f of summary.failures.slice(0, 50)) console.log(`  - ${f}`)
  }

  if (dryRun) {
    console.log('\nNothing above was written. Re-run without --dry-run to apply.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
