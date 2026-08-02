import { periodDate } from './finance/billingCycle'
import type { Installment } from './installments'
import { supabase } from './supabase'

// DESIGN.md §6.7/§4.5 (D11): an installment plan writes **every** period as
// a real transaction the moment the plan exists — not just the periods due
// so far. A 10-period plan is ten known, dated, unavoidable charges; hiding
// the future ones made them invisible in the months they actually land,
// which is the whole reason a plan is entered in the first place.
//
// Whether a period has been *settled* is a separate question from whether it
// has been *posted*: settlement is an `installment_payments` event, written
// by ticking the period's checkbox in the ledger (card-billed plans) or the
// "mark period paid" button (account-billed). So the materialiser never
// writes payment rows — it only posts the charge.
//
// Idempotency: each posted period gets source_key = "installment:<id>:<n>",
// covered by the (household_id, source_key) unique constraint (0014), so a
// concurrent run from the other phone resolves to a no-op rather than a
// duplicate charge.

/** The `source_key` a given period's transaction carries. */
export function periodSourceKey(installmentId: string, periodNo: number): string {
  return `installment:${installmentId}:${periodNo}`
}

/** Inverse of `periodSourceKey`; null when the key isn't an installment one. */
export function parsePeriodSourceKey(
  sourceKey: string | null,
): { installmentId: string; periodNo: number } | null {
  if (!sourceKey) return null
  const [tag, installmentId, periodNoStr] = sourceKey.split(':')
  if (tag !== 'installment' || !installmentId) return null
  const periodNo = Number(periodNoStr)
  return Number.isFinite(periodNo) ? { installmentId, periodNo } : null
}

export async function materialiseInstallmentsDue(
  householdId: string,
  installments: Installment[],
): Promise<number> {
  const active = installments.filter((i) => i.status === 'active' && (i.card_id || i.account_id))
  if (active.length === 0) return 0

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('source_key')
    .eq('household_id', householdId)
    .eq('source', 'installment')
    .is('deleted_at', null)
  if (existingError) throw existingError

  const postedSet = new Set((existing ?? []).map((t) => t.source_key as string))

  let posted = 0
  for (const inst of active) {
    const cardBilled = Boolean(inst.card_id)

    // An expense must carry a category (transactions' category_iff_not_transfer
    // check), but a plan can be saved without one. Skipping the plan keeps a
    // single un-categorised plan from failing the batch and stalling posting
    // for every other plan — which is exactly what happened in production.
    if (!inst.category_id) {
      console.warn(`Installment "${inst.name}" has no category; its periods cannot post until one is set.`)
      continue
    }

    const rows: Record<string, unknown>[] = []
    for (let n = 1; n <= inst.total_periods; n++) {
      const sourceKey = periodSourceKey(inst.id, n)
      if (postedSet.has(sourceKey)) continue

      rows.push({
        household_id: householdId,
        date: periodDate(inst.start_date, n),
        kind: 'expense',
        category_id: inst.category_id,
        category_kind: 'expense',
        description: `${inst.name} (งวดที่ ${n}/${inst.total_periods})`,
        amount: n === inst.total_periods && inst.final_amount != null ? inst.final_amount : inst.monthly_amount,
        owner_id: inst.owner_id,
        from_card_id: cardBilled ? inst.card_id : null,
        from_account_id: cardBilled ? null : inst.account_id,
        source: 'installment',
        source_key: sourceKey,
        // Posted, not settled — these are scheduled charges the user already
        // committed to, so they don't need a second review tap. The paid
        // checkbox is what tracks settlement.
        confirmed: true,
      })
    }

    if (rows.length === 0) continue

    // Per plan, not one batch for all: a row Postgres refuses aborts the whole
    // statement, so batching every plan together lets one bad plan block
    // posting for all of them. upsert-ignore rather than insert because a
    // period may have been posted by the other device mid-run.
    const { error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'household_id,source_key', ignoreDuplicates: true })
    if (error) {
      console.error(`Could not post periods for installment "${inst.name}"`, error)
      continue
    }
    posted += rows.length
  }

  return posted
}
