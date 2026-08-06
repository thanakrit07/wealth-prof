// Balances (DESIGN.md §6.3b, D19, ADR-0008): what each row on the Balances
// screen shows (capacity) and what the headline shows (net worth). Kept
// separate from billingCycle.ts because the two figures deliberately use
// different time windows — see the account/card asymmetry below.

export interface AccountLike {
  id: string
  owner_id: string | null
  anchor_balance: number
  anchor_date: string // yyyy-MM-dd
}

export interface CardLike {
  id: string
  owner_id: string | null
  credit_limit: number
}

export interface TransactionLike {
  kind: 'income' | 'expense' | 'transfer'
  date: string // yyyy-MM-dd
  amount: number
  confirmed: boolean
  from_account_id: string | null
  from_card_id: string | null
  to_account_id: string | null
  to_card_id: string | null
}

export interface DebtLike {
  owes_member_id: string
  owed_member_id: string
  amount: number
}

// §6.3: anchor + everything since, confirmed rows only. Bounded by `today`
// (D19) — an installment period dated next month hasn't left the account yet,
// even though it already exists as a posted transaction (ADR-0001).
export function accountBalance(account: AccountLike, transactions: TransactionLike[], today: string): number {
  let balance = account.anchor_balance
  for (const t of transactions) {
    if (!t.confirmed || t.date <= account.anchor_date || t.date > today) continue
    if (t.kind === 'income' && t.from_account_id === account.id) balance += t.amount
    else if (t.kind === 'expense' && t.from_account_id === account.id) balance -= t.amount
    else if (t.kind === 'transfer') {
      if (t.to_account_id === account.id) balance += t.amount
      if (t.from_account_id === account.id) balance -= t.amount
    }
  }
  return balance
}

// D19/ADR-0008: every charge minus every payment, confirmed rows only, with
// NO date ceiling — unlike an account, a card's debt exists in full the
// moment an installment plan starts (ADR-0001), and the issuer has already
// blocked the limit for periods dated months from now. This single running
// total is mathematically the same figure §6.2 built from three parts (the
// current cycle, carried balance, and future installment charges), because
// every installment period — past, current or future — already exists as a
// real posted transaction; there is nothing left to add on top of the sum.
export function cardOutstanding(card: CardLike, transactions: TransactionLike[]): number {
  let owed = 0
  for (const t of transactions) {
    if (!t.confirmed) continue
    if (t.kind === 'expense' && t.from_card_id === card.id) owed += t.amount
    else if (t.kind === 'transfer') {
      if (t.from_card_id === card.id) owed += t.amount // cash advance / moved off the card
      if (t.to_card_id === card.id) owed -= t.amount // a bill payment
    }
  }
  return owed
}

export function creditAvailable(card: CardLike, transactions: TransactionLike[]): number {
  return card.credit_limit - cardOutstanding(card, transactions)
}

// D19: money − card debt + what others owe this member − what this member
// owes others. Inter-member debts cancel across the household, which is
// what keeps memberNetWorth(A) + memberNetWorth(B) === householdNetWorth
// true (ADR-0008) — a Common Pot (D18) is deliberately not part of this: it
// belongs to no one member, so it is never folded into anyone's figure.
export function memberNetWorth(
  memberId: string,
  accounts: AccountLike[],
  cards: CardLike[],
  transactions: TransactionLike[],
  debts: DebtLike[],
  today: string,
): number {
  let worth = 0
  for (const a of accounts) {
    if (a.owner_id === memberId) worth += accountBalance(a, transactions, today)
  }
  for (const c of cards) {
    if (c.owner_id === memberId) worth -= cardOutstanding(c, transactions)
  }
  for (const d of debts) {
    if (d.owed_member_id === memberId) worth += d.amount
    if (d.owes_member_id === memberId) worth -= d.amount
  }
  return worth
}

// A Common Pot's balance: the accounts/cards with no owner, at face value —
// D18 gives it no per-person breakdown, so this is simply reported, never
// added into anyone's net worth or the household net-worth sum.
export function commonPotBalance(accounts: AccountLike[], cards: CardLike[], transactions: TransactionLike[], today: string): number {
  let total = 0
  for (const a of accounts) {
    if (a.owner_id === null) total += accountBalance(a, transactions, today)
  }
  for (const c of cards) {
    if (c.owner_id === null) total -= cardOutstanding(c, transactions)
  }
  return total
}
