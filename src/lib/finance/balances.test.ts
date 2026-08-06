import { describe, expect, it } from 'vitest'
import { accountBalance, cardOutstanding, commonPotBalance, creditAvailable, memberNetWorth } from './balances'

const A = 'member-a'
const B = 'member-b'

const account = (over: Partial<Parameters<typeof accountBalance>[0]> = {}) => ({
  id: 'acc-1',
  owner_id: A,
  anchor_balance: 1000,
  anchor_date: '2026-01-01',
  ...over,
})

const card = (over: Partial<Parameters<typeof cardOutstanding>[0]> = {}) => ({
  id: 'card-1',
  owner_id: A,
  credit_limit: 50000,
  ...over,
})

function txn(over: Partial<Parameters<typeof accountBalance>[1][number]>) {
  return {
    kind: 'expense' as const,
    date: '2026-01-15',
    amount: 0,
    confirmed: true,
    from_account_id: null,
    from_card_id: null,
    to_account_id: null,
    to_card_id: null,
    ...over,
  }
}

describe('accountBalance', () => {
  it('adds income and subtracts expense after the anchor date', () => {
    const acc = account()
    const txns = [
      txn({ kind: 'income', amount: 500, from_account_id: 'acc-1', date: '2026-01-10' }),
      txn({ kind: 'expense', amount: 200, from_account_id: 'acc-1', date: '2026-01-12' }),
    ]
    expect(accountBalance(acc, txns, '2026-01-31')).toBe(1300)
  })

  it('adds transfers in and subtracts transfers out', () => {
    const acc = account()
    const txns = [
      txn({ kind: 'transfer', amount: 300, to_account_id: 'acc-1', date: '2026-01-10' }),
      txn({ kind: 'transfer', amount: 100, from_account_id: 'acc-1', date: '2026-01-12' }),
    ]
    expect(accountBalance(acc, txns, '2026-01-31')).toBe(1200)
  })

  it('ignores rows for other accounts', () => {
    const acc = account()
    const txns = [txn({ kind: 'expense', amount: 999, from_account_id: 'some-other-account', date: '2026-01-12' })]
    expect(accountBalance(acc, txns, '2026-01-31')).toBe(1000)
  })

  it('ignores unconfirmed rows', () => {
    const acc = account()
    const txns = [txn({ kind: 'income', amount: 500, from_account_id: 'acc-1', date: '2026-01-10', confirmed: false })]
    expect(accountBalance(acc, txns, '2026-01-31')).toBe(1000)
  })

  it('ignores rows on or before the anchor date', () => {
    const acc = account({ anchor_date: '2026-01-10' })
    const txns = [txn({ kind: 'income', amount: 500, from_account_id: 'acc-1', date: '2026-01-10' })]
    expect(accountBalance(acc, txns, '2026-01-31')).toBe(1000)
  })

  it('excludes rows dated after "today" — an installment period posted ahead has not left the account yet (D19)', () => {
    const acc = account()
    const txns = [txn({ kind: 'expense', amount: 500, from_account_id: 'acc-1', date: '2026-03-01' })]
    expect(accountBalance(acc, txns, '2026-01-31')).toBe(1000)
  })
})

describe('cardOutstanding', () => {
  it('sums charges', () => {
    const c = card()
    const txns = [txn({ kind: 'expense', amount: 3000, from_card_id: 'card-1' })]
    expect(cardOutstanding(c, txns)).toBe(3000)
  })

  it('is NOT bounded by date — a future installment period already counts (ADR-0001)', () => {
    const c = card()
    const txns = [
      txn({ kind: 'expense', amount: 1000, from_card_id: 'card-1', date: '2026-01-15' }),
      txn({ kind: 'expense', amount: 1000, from_card_id: 'card-1', date: '2027-06-15' }),
    ]
    expect(cardOutstanding(c, txns)).toBe(2000)
  })

  it('a bill payment (transfer to the card) reduces what is owed', () => {
    const c = card()
    const txns = [
      txn({ kind: 'expense', amount: 5000, from_card_id: 'card-1' }),
      txn({ kind: 'transfer', amount: 5000, to_card_id: 'card-1' }),
    ]
    expect(cardOutstanding(c, txns)).toBe(0)
  })

  it('a cash advance (transfer off the card) increases what is owed', () => {
    const c = card()
    const txns = [txn({ kind: 'transfer', amount: 2000, from_card_id: 'card-1', to_account_id: 'acc-1' })]
    expect(cardOutstanding(c, txns)).toBe(2000)
  })
})

describe('creditAvailable', () => {
  it('is the limit minus what is owed', () => {
    const c = card({ credit_limit: 10000 })
    const txns = [txn({ kind: 'expense', amount: 4000, from_card_id: 'card-1' })]
    expect(creditAvailable(c, txns)).toBe(6000)
  })
})

describe('memberNetWorth', () => {
  it('sums only the accounts and cards this member owns', () => {
    const accounts = [account({ id: 'a-1', owner_id: A, anchor_balance: 1000 }), account({ id: 'a-2', owner_id: B, anchor_balance: 5000 })]
    expect(memberNetWorth(A, accounts, [], [], [], '2026-01-31')).toBe(1000)
  })

  it('subtracts card debt', () => {
    const accounts = [account({ anchor_balance: 5000 })]
    const cards = [card({ credit_limit: 10000 })]
    const txns = [txn({ kind: 'expense', amount: 3000, from_card_id: 'card-1' })]
    expect(memberNetWorth(A, accounts, cards, txns, [], '2026-01-31')).toBe(2000)
  })

  it('never splits a card debt by Borne — the owner carries all of it, offset only by the actual inter-member Debt', () => {
    const accounts: ReturnType<typeof account>[] = []
    const cards = [card({ owner_id: A, credit_limit: 10000 })]
    const txns = [txn({ kind: 'expense', amount: 1000, from_card_id: 'card-1' })]
    const debts = [{ owes_member_id: B, owed_member_id: A, amount: 500 }]
    expect(memberNetWorth(A, accounts, cards, txns, debts, '2026-01-31')).toBe(-1000 + 500)
    expect(memberNetWorth(B, accounts, cards, txns, debts, '2026-01-31')).toBe(-500)
  })

  it('debts cancel across the household — A + B sums to the same total as if there were no debts (ADR-0008)', () => {
    const accounts = [account({ id: 'a-1', owner_id: A, anchor_balance: 1000 }), account({ id: 'a-2', owner_id: B, anchor_balance: 1000 })]
    const debts = [{ owes_member_id: A, owed_member_id: B, amount: 300 }]
    const withDebt = memberNetWorth(A, accounts, [], [], debts, '2026-01-31') + memberNetWorth(B, accounts, [], [], debts, '2026-01-31')
    const withoutDebt = memberNetWorth(A, accounts, [], [], [], '2026-01-31') + memberNetWorth(B, accounts, [], [], [], '2026-01-31')
    expect(withDebt).toBe(withoutDebt)
  })
})

describe('commonPotBalance', () => {
  it('sums only ownerless accounts and cards, at face value', () => {
    const accounts = [account({ id: 'a-1', owner_id: null, anchor_balance: 1000 }), account({ id: 'a-2', owner_id: A, anchor_balance: 5000 })]
    expect(commonPotBalance(accounts, [], [], '2026-01-31')).toBe(1000)
  })

  it('is unaffected by who transferred into it — contributions do not change the pot itself (D18)', () => {
    const accounts = [account({ id: 'a-1', owner_id: null, anchor_balance: 0 })]
    const txns = [
      txn({ kind: 'transfer', amount: 1000, to_account_id: 'a-1', date: '2026-01-05' }),
      txn({ kind: 'transfer', amount: 2000, to_account_id: 'a-1', date: '2026-01-06' }),
    ]
    expect(commonPotBalance(accounts, [], txns, '2026-01-31')).toBe(3000)
  })
})
