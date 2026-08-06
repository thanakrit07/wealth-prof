// D14 (DESIGN.md §7.5): the person filter means Borne everywhere, not which
// owner_id bucket a row sits in. 'all' = no filter; otherwise a member id.
export type PersonFilter = 'all' | string

export interface ShareLike {
  member_id: string
  share_amount: number
}

// The portion of a transaction a member Borne (CONTEXT.md): their own share
// rows if the transaction has an explicit Split (D13), or the whole amount
// if they're its owner and it has no Split, or nothing at all -- even if
// their own instrument paid for it (that's Fronted, a different question,
// answered by the instrument's own screens).
export function borneAmount(
  transaction: { id: string; owner_id: string | null; amount: number },
  sharesByTransactionId: Map<string, ShareLike[]>,
  memberId: string,
): number {
  const shares = sharesByTransactionId.get(transaction.id)
  if (shares && shares.length > 0) {
    return shares.filter((s) => s.member_id === memberId).reduce((sum, s) => sum + s.share_amount, 0)
  }
  return transaction.owner_id === memberId ? transaction.amount : 0
}

export function matchesPersonFilter(
  transaction: { id: string; owner_id: string | null; amount: number },
  sharesByTransactionId: Map<string, ShareLike[]>,
  filter: PersonFilter,
): boolean {
  if (filter === 'all') return true
  return borneAmount(transaction, sharesByTransactionId, filter) > 0
}

export function sharesByTransaction<T extends ShareLike & { transaction_id: string }>(
  shares: T[] | undefined,
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const s of shares ?? []) {
    const list = map.get(s.transaction_id) ?? []
    list.push(s)
    map.set(s.transaction_id, list)
  }
  return map
}
