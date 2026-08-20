import type { Transaction } from './transactions'

// D22 / ADR-0015: collapsing a Receipt is a **display** step, and it must run
// after totalling, never before. A day's income and expense totals still sum
// the flat list of transactions; this only decides how those same rows are
// laid out. Grouping first — and then summing the collapsed rows — is how a
// receipt would come to be counted twice.
export type LedgerEntry =
  | { type: 'transaction'; transaction: Transaction }
  | { type: 'receipt'; receiptId: string; lines: Transaction[] }

/**
 * Lays out one day's transactions, gathering the lines of each Receipt into a
 * single entry positioned where its first line sat. Everything else keeps its
 * place, so the ledger's own ordering (date, then newest first) is preserved.
 *
 * The input is whatever survived the person filter, so a Receipt can arrive
 * here with fewer lines than it really has — a line borne entirely by the
 * other member is simply not in the list. That is D14 working as specified:
 * what the row shows is what the filtered person bears, and showing the whole
 * receipt to both people is the `A + B = All` breakage D14 exists to end.
 *
 * A Receipt left with a single visible line is still a Receipt. Dissolving it
 * back into a plain row would put two shapes on the same state, which is the
 * thing this design avoids everywhere else.
 */
export function groupByReceipt(items: Transaction[]): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  const byReceipt = new Map<string, { type: 'receipt'; receiptId: string; lines: Transaction[] }>()

  for (const transaction of items) {
    const receiptId = transaction.receipt_id
    if (receiptId == null) {
      entries.push({ type: 'transaction', transaction })
      continue
    }
    const existing = byReceipt.get(receiptId)
    if (existing) {
      existing.lines.push(transaction)
      continue
    }
    const entry = { type: 'receipt' as const, receiptId, lines: [transaction] }
    byReceipt.set(receiptId, entry)
    entries.push(entry)
  }

  return entries
}

/** The amount an entry contributes, given whatever measure the caller uses
 *  (the raw amount under "All", the Borne portion under a person filter). */
export function entryAmount(entry: LedgerEntry, amountOf: (t: Transaction) => number): number {
  if (entry.type === 'transaction') return amountOf(entry.transaction)
  return entry.lines.reduce((sum, line) => sum + amountOf(line), 0)
}
