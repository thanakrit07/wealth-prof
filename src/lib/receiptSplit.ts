import { applyRatioSplit, type RatioSplit, type ShareRow } from './transactionShares'

/**
 * The Split a Receipt's lines inherit (D22 / ADR-0015): the one the
 * transaction already carried before it was split, re-expressed as ratios and
 * applied to each line's own amount.
 *
 * Nothing about this is stored on the Receipt. It generates nothing after its
 * form closes — every line is written in the same moment — so a stored ratio
 * would have no reader and one behaviour: going stale the first time a line's
 * Split is edited. Each line's `transaction_shares` is the whole truth about
 * it from here on, and editing one line leaves its siblings alone.
 *
 * Ratios come from the shares' own sum rather than the transaction amount:
 * the two agree by the sum check (0022), and using what is actually there
 * cannot divide by a figure the rows disagree with.
 */
export function inheritedSplitFor(originalShares: ShareRow[], lineAmount: number): ShareRow[] {
  if (originalShares.length === 0 || lineAmount <= 0) return []
  const total = originalShares.reduce((sum, r) => sum + r.share_amount, 0)
  if (total <= 0) return []
  const ratios: RatioSplit[] = originalShares.map((r) => ({
    member_id: r.member_id,
    ratio: r.share_amount / total,
  }))
  // Largest-remainder, so every line's shares sum to that line exactly —
  // which is what the deferred sum check judges at commit.
  return applyRatioSplit(ratios, lineAmount)
}
