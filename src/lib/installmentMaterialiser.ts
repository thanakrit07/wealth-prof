import { periodDate } from './finance/billingCycle'
import type { Installment } from './installments'
import { supabase } from './supabase'

// DESIGN.md §6.7 (D11): card-billed installment periods post themselves —
// the charge lands on the real statement whether or not anyone taps a
// button, so the app must already agree with it. Mirrors the recurring
// materialiser (§6.6) but scoped to card-billed plans only; account-billed
// periods still go through the manual "mark period paid" flow (§4.5) since
// a real bank debit gets a human glance first.
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
  const cardBilled = installments.filter((i) => i.status === 'active' && i.card_id)
  if (cardBilled.length === 0) return 0

  const { data: existingPayments, error: paymentsError } = await supabase
    .from('installment_payments')
    .select('installment_id, period_no')
    .in(
      'installment_id',
      cardBilled.map((i) => i.id),
    )
  if (paymentsError) throw paymentsError

  const paidSet = new Set((existingPayments ?? []).map((p) => `${p.installment_id}:${p.period_no}`))

  let posted = 0
  for (const inst of cardBilled) {
    for (let n = 1; n <= inst.total_periods; n++) {
      const date = periodDate(inst.start_date, n)
      if (date > today) break
      if (paidSet.has(`${inst.id}:${n}`)) continue

      const amount = n === inst.total_periods && inst.final_amount != null ? inst.final_amount : inst.monthly_amount

      const { data: txn, error: txnError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          date,
          kind: 'expense',
          category_id: inst.category_id,
          category_kind: inst.category_id ? 'expense' : null,
          description: `${inst.name} (${n}/${inst.total_periods})`,
          amount,
          owner_id: inst.owner_id,
          from_card_id: inst.card_id,
          source: 'installment',
          source_key: `installment:${inst.id}:${n}`,
          confirmed: true,
        })
        .select('id')
        .single()

      if (txnError) {
        if (txnError.code === UNIQUE_VIOLATION) continue // already posted by another run
        throw txnError
      }

      const { error: paymentError } = await supabase.from('installment_payments').insert({
        household_id: householdId,
        installment_id: inst.id,
        period_no: n,
        paid_date: date,
        transaction_id: txn.id,
      })
      if (paymentError && paymentError.code !== UNIQUE_VIOLATION) throw paymentError

      posted += 1
      if (n === inst.total_periods) {
        await supabase.from('installments').update({ status: 'done' }).eq('id', inst.id)
      }
    }
  }
  return posted
}
