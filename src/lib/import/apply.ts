import { adjustmentCategory } from '../balanceAdjustments'
import type { Category } from '../categories'
import { periodDate } from '../finance/billingCycle'
import { supabase } from '../supabase'
import { normalizeName } from './values'
import type { EntityKind, ImportPlan, PlannedInstallment, PlannedRecurringRule, PlannedTransaction } from './types'

// The apply layer: the only place in src/lib/import with I/O. Everything it
// decides was already decided by plan.ts — this just resolves the plan's
// name references to real ids (against a fresh DB read, not the snapshot
// buildPlan validated against, since the two can be seconds apart) and
// writes rows in FK order. Insert-only throughout (no upsert): a name
// collision surfaces as a unique-constraint failure that stops the run,
// which is the safe failure mode for a one-time load into a household that
// was wiped beforehand — see the ADR.

const CHUNK_SIZE = 500

export type ApplyStage = EntityKind | 'openingBalances' | 'installmentPayments'

export interface ApplyProgress {
  stage: ApplyStage
  completed: number
  total: number
}

export interface ApplyResult {
  insertedCounts: Partial<Record<ApplyStage, number>>
  failedAt: ApplyStage | null
  error: string | null
}

// The generic row type is intentionally erased to `Record<string, unknown>`
// before it reaches supabase-js: its `.insert()` overloads reject a generic
// array parameter under strict excess-property checking, and every caller
// already built its rows against the real table shape.
async function chunkedInsert(table: string, rows: Record<string, unknown>[], onChunk?: (done: number, total: number) => void): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw error
    onChunk?.(Math.min(i + CHUNK_SIZE, rows.length), rows.length)
  }
}

// Whether this household already has rows from an earlier import — checked
// before apply starts (ImportScreen, phase 3) so re-running into
// already-imported data fails as a clear preflight warning rather than a
// half-finished write halfway through.
export async function hasExistingImportRows(householdId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('source', 'import')
  if (error) throw error
  return (count ?? 0) > 0
}

interface NameMaps {
  categoryId: Map<string, string> // `${kind}:${normalizedName}` -> id
  accountId: Map<string, string>
  cardId: Map<string, string>
  memberId: Map<string, string>
}

async function fetchNameMaps(householdId: string): Promise<{ maps: NameMaps; categories: Category[] }> {
  const [{ data: categories, error: catError }, { data: accounts, error: acctError }, { data: cards, error: cardError }, { data: members, error: memberError }] =
    await Promise.all([
      supabase
        .from('v_categories')
        .select('id, household_id, name, kind, icon, color, sort_order, archived, parent_id, system')
        .eq('household_id', householdId),
      supabase.from('v_accounts').select('id, name').eq('household_id', householdId),
      supabase.from('v_cards').select('id, name').eq('household_id', householdId),
      supabase.from('household_members').select('id, display_name').eq('household_id', householdId),
    ])
  if (catError) throw catError
  if (acctError) throw acctError
  if (cardError) throw cardError
  if (memberError) throw memberError

  const maps: NameMaps = {
    categoryId: new Map((categories ?? []).map((c) => [`${c.kind}:${normalizeName(c.name)}`, c.id as string])),
    accountId: new Map((accounts ?? []).map((a) => [normalizeName(a.name as string), a.id as string])),
    cardId: new Map((cards ?? []).map((c) => [normalizeName(c.name as string), c.id as string])),
    memberId: new Map((members ?? []).map((m) => [normalizeName(m.display_name as string), m.id as string])),
  }
  return { maps, categories: (categories ?? []) as Category[] }
}

// A row's category/account/card name was already confirmed to resolve
// during planning (against a slightly earlier snapshot) — if it doesn't
// resolve here, something changed between preview and apply (another
// device, or the household context going stale). Surfacing that as a
// thrown error is correct: apply stops, the summary says which entity it
// stopped at, same as any other partial-failure case.
function requireId(map: Map<string, string>, key: string, what: string): string {
  const id = map.get(key)
  if (!id) throw new Error(`${what} "${key}" could not be resolved — it may have changed since the preview was built. Re-open Import and try again.`)
  return id
}

function instrumentIds(maps: NameMaps, name: string): { accountId: string | null; cardId: string | null } {
  const norm = normalizeName(name)
  const accountId = maps.accountId.get(norm)
  if (accountId) return { accountId, cardId: null }
  const cardId = maps.cardId.get(norm)
  if (cardId) return { accountId: null, cardId }
  throw new Error(`Account or card "${name}" could not be resolved — it may have changed since the preview was built. Re-open Import and try again.`)
}

export async function applyPlan(householdId: string, plan: ImportPlan, onProgress?: (progress: ApplyProgress) => void): Promise<ApplyResult> {
  const insertedCounts: Partial<Record<ApplyStage, number>> = {}
  let stage: ApplyStage = 'categories'

  try {
    const { maps, categories: existingCategories } = await fetchNameMaps(householdId)

    // --- categories: mains first, then subs, so a sub's parent id always
    // resolves whether the parent was already there or created this run.
    // No source_key here — unlike accounts/cards/installments/transactions/
    // recurring_rules (0013, 0021), categories never got that column, so
    // there's nothing to dedupe re-import runs against for this entity. ---
    stage = 'categories'
    const categoryRows = plan.categories.map((r) => r.value).filter((v) => v !== null)
    const mains = categoryRows.filter((c) => !c.parentName)
    const subs = categoryRows.filter((c) => c.parentName)
    if (mains.length > 0) {
      const { data, error } = await supabase
        .from('categories')
        .insert(
          mains.map((c, i) => ({
            household_id: householdId,
            name: c.name,
            kind: c.kind,
            icon: c.icon,
            color: c.color,
            sort_order: i,
          })),
        )
        .select('id, name, kind')
      if (error) throw error
      for (const row of data ?? []) maps.categoryId.set(`${row.kind}:${normalizeName(row.name as string)}`, row.id as string)
    }
    if (subs.length > 0) {
      const { data, error } = await supabase
        .from('categories')
        .insert(
          subs.map((c, i) => ({
            household_id: householdId,
            name: c.name,
            kind: c.kind,
            icon: c.icon,
            color: c.color,
            sort_order: i,
            parent_id: requireId(maps.categoryId, `${c.kind}:${normalizeName(c.parentName!)}`, 'Parent category'),
          })),
        )
        .select('id, name, kind')
      if (error) throw error
      for (const row of data ?? []) maps.categoryId.set(`${row.kind}:${normalizeName(row.name as string)}`, row.id as string)
    }
    insertedCounts.categories = mains.length + subs.length
    onProgress?.({ stage, completed: insertedCounts.categories, total: insertedCounts.categories })

    // --- accounts ---
    stage = 'accounts'
    const accountRows = plan.accounts.map((r) => r.value).filter((v) => v !== null)
    if (accountRows.length > 0) {
      const { data, error } = await supabase
        .from('accounts')
        .insert(
          accountRows.map((a, i) => ({
            household_id: householdId,
            name: a.name,
            type: a.type,
            owner_id: a.ownerName ? requireId(maps.memberId, normalizeName(a.ownerName), 'Owner') : null,
            source_key: `import:accounts:${i}`,
          })),
        )
        .select('id, name')
      if (error) throw error
      for (const row of data ?? []) maps.accountId.set(normalizeName(row.name as string), row.id as string)
    }
    insertedCounts.accounts = accountRows.length
    onProgress?.({ stage, completed: accountRows.length, total: accountRows.length })

    // --- cards ---
    stage = 'cards'
    const cardRows = plan.cards.map((r) => r.value).filter((v) => v !== null)
    if (cardRows.length > 0) {
      const { data, error } = await supabase
        .from('cards')
        .insert(
          cardRows.map((c, i) => ({
            household_id: householdId,
            name: c.name,
            credit_limit: c.creditLimit,
            statement_day: c.statementDay,
            due_day: c.dueDay,
            annual_interest_rate: c.annualInterestRate,
            owner_id: c.ownerName ? requireId(maps.memberId, normalizeName(c.ownerName), 'Owner') : null,
            source_key: `import:cards:${i}`,
          })),
        )
        .select('id, name')
      if (error) throw error
      for (const row of data ?? []) maps.cardId.set(normalizeName(row.name as string), row.id as string)
    }
    insertedCounts.cards = cardRows.length
    onProgress?.({ stage, completed: cardRows.length, total: cardRows.length })

    // --- installments ---
    stage = 'installments'
    const installmentRows: { rowNumber: number; value: PlannedInstallment }[] = plan.installments
      .filter((r): r is { rowNumber: number; raw: Record<string, string>; value: PlannedInstallment } => r.value !== null)
      .map((r) => ({ rowNumber: r.rowNumber, value: r.value }))
    const installmentIds: string[] = []
    if (installmentRows.length > 0) {
      const { data, error } = await supabase
        .from('installments')
        .insert(
          installmentRows.map(({ value: inst }, i) => {
            const { accountId, cardId } = instrumentIds(maps, inst.instrumentName)
            return {
              household_id: householdId,
              name: inst.name,
              category_id: requireId(maps.categoryId, `expense:${normalizeName(inst.categoryName)}`, 'Category'),
              start_date: inst.startDate,
              total_periods: inst.totalPeriods,
              monthly_amount: inst.monthlyAmount,
              final_amount: inst.finalAmount,
              card_id: cardId,
              account_id: accountId,
              annual_interest_rate: inst.annualInterestRate,
              is_cash_advance: inst.isCashAdvance,
              owner_id: inst.ownerName ? requireId(maps.memberId, normalizeName(inst.ownerName), 'Owner') : null,
              note: inst.note,
              status: inst.status,
              split: null,
              source_key: `import:installments:${i}`,
            }
          }),
        )
        .select('id')
      if (error) throw error
      installmentIds.push(...(data ?? []).map((r) => r.id as string))
    }
    insertedCounts.installments = installmentRows.length
    onProgress?.({ stage, completed: installmentRows.length, total: installmentRows.length })

    // --- installment_payments (backfill for periodsPaid) — no
    // transaction_id: the period's own transaction is written by the app's
    // materialiser on next open, after apply finishes, so there is nothing
    // to link to yet. Matches the old script's same, documented gap. ---
    stage = 'installmentPayments'
    const paymentRows = installmentRows.flatMap(({ value: inst }, i) => {
      const installmentId = installmentIds[i]
      return Array.from({ length: inst.periodsPaid }, (_, periodIndex) => {
        const periodNo = periodIndex + 1
        return {
          household_id: householdId,
          installment_id: installmentId,
          period_no: periodNo,
          paid_date: periodDate(inst.startDate, periodNo),
        }
      })
    })
    if (paymentRows.length > 0) await chunkedInsert('installment_payments', paymentRows)
    insertedCounts.installmentPayments = paymentRows.length
    onProgress?.({ stage, completed: paymentRows.length, total: paymentRows.length })

    // --- recurring rules ---
    stage = 'recurringRules'
    const recurringRows: PlannedRecurringRule[] = plan.recurringRules.map((r) => r.value).filter((v) => v !== null)
    if (recurringRows.length > 0) {
      await chunkedInsert(
        'recurring_rules',
        recurringRows.map((rule, i) => {
          const { accountId, cardId } = instrumentIds(maps, rule.instrumentName)
          const to = rule.toInstrumentName ? instrumentIds(maps, rule.toInstrumentName) : { accountId: null, cardId: null }
          return {
            household_id: householdId,
            name: rule.name,
            kind: rule.kind,
            category_id: rule.categoryName ? requireId(maps.categoryId, `${rule.kind}:${normalizeName(rule.categoryName)}`, 'Category') : null,
            category_kind: rule.kind === 'transfer' ? null : rule.kind,
            amount: rule.amount,
            owner_id: rule.ownerName ? requireId(maps.memberId, normalizeName(rule.ownerName), 'Owner') : null,
            from_account_id: accountId,
            from_card_id: cardId,
            to_account_id: to.accountId,
            to_card_id: to.cardId,
            note: rule.note,
            freq: rule.freq,
            interval: rule.interval,
            day_of_month: rule.dayOfMonth,
            month_of_year: rule.monthOfYear,
            weekday: rule.weekday,
            month_end: rule.monthEnd,
            start_date: rule.startDate,
            end_date: rule.endDate,
            auto_post: rule.autoPost,
            variable_amount: rule.variableAmount,
            active: rule.active,
            last_generated_date: rule.lastGeneratedDate,
            split: null,
            source_key: `import:recurringRules:${i}`,
          }
        }),
      )
    }
    insertedCounts.recurringRules = recurringRows.length
    onProgress?.({ stage, completed: recurringRows.length, total: recurringRows.length })

    // --- transactions, plus opening-balance Reconcile rows folded in ---
    stage = 'transactions'
    interface TransactionInsertRow {
      household_id: string
      date: string
      kind: 'income' | 'expense' | 'transfer'
      category_id: string | null
      category_kind: 'income' | 'expense' | null
      description: string
      amount: number
      owner_id: string | null
      from_account_id: string | null
      from_card_id: string | null
      to_account_id: string | null
      to_card_id: string | null
      note: string | null
      source: 'import' | 'reconcile'
      source_key: string
    }
    const transactionRows: PlannedTransaction[] = plan.transactions.map((r) => r.value).filter((v) => v !== null)
    const rows: TransactionInsertRow[] = transactionRows.map((t, i) => {
      const { accountId, cardId } = instrumentIds(maps, t.instrumentName)
      const to = t.toInstrumentName ? instrumentIds(maps, t.toInstrumentName) : { accountId: null, cardId: null }
      return {
        household_id: householdId,
        date: t.date,
        kind: t.kind,
        category_id: t.categoryName ? requireId(maps.categoryId, `${t.kind}:${normalizeName(t.categoryName)}`, 'Category') : null,
        category_kind: t.kind === 'transfer' ? null : t.kind,
        description: t.description,
        amount: t.amount,
        owner_id: t.ownerName ? requireId(maps.memberId, normalizeName(t.ownerName), 'Owner') : null,
        from_account_id: accountId,
        from_card_id: cardId,
        to_account_id: to.accountId,
        to_card_id: to.cardId,
        note: t.note,
        source: 'import' as const,
        source_key: `import:transactions:${i}`,
      }
    })

    stage = 'openingBalances'
    const accountsWithOpening = plan.accounts.map((r) => r.value).filter((v): v is NonNullable<typeof v> => v !== null && v.openingBalance !== null)
    const otherExpenseCategory = adjustmentCategory(existingCategories, 'expense', true)
    const otherIncomeCategory = adjustmentCategory(existingCategories, 'income', true)
    for (const [i, account] of accountsWithOpening.entries()) {
      const balance = account.openingBalance!
      const kind = balance >= 0 ? 'income' : 'expense'
      const category = kind === 'income' ? otherIncomeCategory : otherExpenseCategory
      if (!category) throw new Error(`No "Other" ${kind} category exists to file the opening balance for "${account.name}" under.`)
      rows.push({
        household_id: householdId,
        date: account.openingAsOf!,
        kind,
        category_id: category.id,
        category_kind: kind,
        description: '',
        amount: Math.abs(balance),
        owner_id: null,
        from_account_id: requireId(maps.accountId, normalizeName(account.name), 'Account'),
        from_card_id: null,
        to_account_id: null,
        to_card_id: null,
        note: 'Opening balance',
        source: 'reconcile' as const,
        source_key: `import:openingBalance:${i}`,
      })
    }

    stage = 'transactions'
    if (rows.length > 0) {
      await chunkedInsert('transactions', rows as unknown as Record<string, unknown>[], (done, total) =>
        onProgress?.({ stage: 'transactions', completed: done, total }),
      )
    }
    insertedCounts.transactions = transactionRows.length
    insertedCounts.openingBalances = accountsWithOpening.length

    return { insertedCounts, failedAt: null, error: null }
  } catch (err) {
    return { insertedCounts, failedAt: stage, error: describeError(err) }
  }
}

// A thrown value here is either an Error (from requireId/instrumentIds — a
// name that stopped resolving) or a PostgrestError (message/details/hint/
// code, not an Error instance) — `String(err)` on the latter collapses to
// the useless "[object Object]", which is what the summary would otherwise
// show for the one failure mode (a real constraint violation) this apply
// layer is most likely to actually hit.
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const { message, details, hint } = err as { message?: string; details?: string; hint?: string }
    return [message, details, hint].filter(Boolean).join(' — ')
  }
  return String(err)
}
