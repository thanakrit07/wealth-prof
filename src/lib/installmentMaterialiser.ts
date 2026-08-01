import { periodDate } from './finance/billingCycle'
import type { Installment } from './installments'
import { supabase } from './supabase'

// DESIGN.md §6.7/§4.5 (D11): installment periods post themselves — the
// charge is due whether or not anyone taps a button, so the app must
// already agree with it. Card-billed periods post confirmed (the charge is
// already on the real statement); account-billed periods post unconfirmed
// into the review strip, since a real bank debit gets a human glance first
// — confirming them is what writes the installment_payments event (see
// useConfirmTransaction).
//
// Idempotency: each posted period gets source_key = "installment:<id>:<n>",
// covered by the (household_id, source_key) unique constraint (0014). A
// unique-violation on insert means another run already posted this period —
// treated as success, not an error.
const UNIQUE_VIOLATION = '23505'

export async function materialiseInstallmentsDue(
  householdId: string,
  installments: Installment[],
  today: string,
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
    for (let n = 1; n <= inst.total_periods; n++) {
      const date = periodDate(inst.start_date, n)
      if (date > today) break
      const sourceKey = `installment:${inst.id}:${n}`
      if (postedSet.has(sourceKey)) continue

      const amount = n === inst.total_periods && inst.final_amount != null ? inst.final_amount : inst.monthly_amount

      const { data: txn, error: txnError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          date,
          kind: 'expense',
          category_id: inst.category_id,
          category_kind: inst.category_id ? 'expense' : null,
          description: `${inst.name} (งวดที่ ${n}/${inst.total_periods})`,
          amount,
          owner_id: inst.owner_id,
          from_card_id: cardBilled ? inst.card_id : null,
          from_account_id: cardBilled ? null : inst.account_id,
          source: 'installment',
          source_key: sourceKey,
          confirmed: cardBilled,
        })
        .select('id')
        .single()

      if (txnError) {
        if (txnError.code === UNIQUE_VIOLATION) continue // already posted by another run
        throw txnError
      }

      posted += 1

      if (cardBilled) {
        const { error: paymentError } = await supabase.from('installment_payments').insert({
          household_id: householdId,
          installment_id: inst.id,
          period_no: n,
          paid_date: date,
          transaction_id: txn.id,
        })
        if (paymentError && paymentError.code !== UNIQUE_VIOLATION) throw paymentError

        if (n === inst.total_periods) {
          await supabase.from('installments').update({ status: 'done' }).eq('id', inst.id)
        }
      }
    }
  }
  return posted
}
