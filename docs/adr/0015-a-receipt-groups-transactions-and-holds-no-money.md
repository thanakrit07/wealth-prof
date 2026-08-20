# A Receipt groups Transactions and holds no money

One payment can cover more than one Category: a ฿1,800 Makro trip is fresh food,
snacks and — some weeks — a saucepan. `transactions.category_id` is a single
column, so the whole charge has to pick one heading and everything else in the
basket is quietly counted as that. A **Receipt** records that several
Transactions came from one payment. It stores an id and a name and nothing else:
the Transactions under it are ordinary Transactions carrying their own Category,
amount and Split, and every figure a Receipt appears to have — its total, its
date, its Instrument — is read back from them.

Because one payment happened, a Receipt's Transactions share a date and an
Instrument. It covers income and expense; a Transfer cannot belong to one, since
a Transfer has no Category to divide (`category_iff_not_transfer`). Splitting is
an edit, not a way of entering: a Transaction is recorded normally and then
turned into a Receipt by stamping `receipt_id` on the row that already exists, so
that row keeps its id and everything pointing at it. A Transaction with no
`receipt_id` is exactly what it was before this decision.

## Considered Options

**More categories, or a third level.** The obvious reading of "I can't track this
properly" is that the category list is too thin. It is not the constraint. The
household's tree already holds 19 mains and 47 subs, and ฿1,800 that is genuinely
three things still has to name one of them however long the list gets or however
deep it nests. A third level also costs what D9 and D17 spent two revisions
protecting — the entry form's tap budget — and breaks the single roll-up
expression every report is built on (`coalesce(parent_id, category_id)`), the
depth cap in `categories_enforce_hierarchy`, and the one-level reach of
`categories_cascade_archive`. Rejected for solving a different problem badly.

**Line items on the Transaction.** A `transaction_lines` table carrying
`(category_id, amount)`, obliged to sum to `transactions.amount`. This is the
most faithful description of what happened — one movement of money, several
attributions — and it was rejected on what it costs to keep honest. It creates a
second table obliged to sum to the same figure as `transaction_shares`, along an
independent axis; migration 0022's own comment records three triggers
deadlocking over that single invariant, and 0024 moved it out of the database
because of it. Worse, it forces a question with no clean answer: does a Split
attach to the Transaction or to the line? The motivating case needs the line —
the saucepan is halved, the snacks are not — which means rebuilding
`transaction_shares` and `v_share_debts`, on which the entire Debt feature
stands. Every report reading `transactions.category_id` would change with it.

**A parent Transaction holding the full amount.** The intuitive shape, and the
dangerous one: ฿1,800 on the parent plus ฿1,200 + ฿300 + ฿300 on the children is
฿3,600 unless every total in the app remembers to exclude one level. Six call
sites sum a flat list today — `RecordsSummary.tsx:205` and `:215`,
`TransactionsScreen.tsx:225`, `balances.ts:94`, `:111` and `:132` — and the
project has already shipped this bug twice, as D7 (a card payment counted on top
of the purchases it settles) and as §6.7's double-count guard. It also breaks
conversion: three foreign keys point at `transactions.id`
(`installment_payments.transaction_id`, `transaction_shares.transaction_id`,
`transaction_shares.settled_by_transaction_id`), so promoting an existing row to
parent would leave a repaid Debt pointing at a row that holds no money.

**A split ratio stored on the Receipt.** `installments` and `recurring_rules`
both carry `split` as jsonb (0026), so the symmetry is tempting. They carry it
because they generate rows in the future, months after the form closed, and must
remember how. A Receipt generates nothing: its Transactions are all written in
the same moment by the same person. A ratio stored on it would have no consumer
and exactly one behaviour — going stale the first time a line's Split is edited.
Inheritance is therefore a behaviour of the form (asked once, written onto every
Transaction as it is created), not stored state.

## Consequences

**Nothing that computes money changes.** The six summing sites, the category
roll-up, the cycle bill, Set Aside and net worth all keep reading Transactions
and all stay correct, because the children are Transactions and the Receipt has
no figure to add. No query needs to become receipt-aware, now or later — the
double-count class of bug is closed by shape rather than by discipline.

**A Receipt is invisible to category reporting, deliberately.** Its Transactions
appear individually under their own Categories. That is the whole point: the
saucepan stops being Food.

**Grouping is a display step and must run after totalling, never before.** A
collapsed row is a rendering of several Transactions, not a thing that carries
their sum.

**Under a person filter, a collapsed row shows less than the paper receipt.** It
sums the Borne portions of the Transactions that survive the filter, and one
borne entirely by the other Member vanishes from it — so the row can read ฿750
of 2 items where the till printed ฿1,800 of 3. This is D14 working as specified;
showing ฿1,800 under both people is exactly the `A + B = All` breakage D14 was
written to end. The full receipt is always visible under `All` and on the
Instrument's own screens.

**A collapsed row cannot show a Category icon**, having no Category. It carries
its own mark and a line count instead. Borrowing the largest line's icon would
reproduce the original complaint on the summary row.

**Deleting a Receipt is one action or none.** If any of its Transactions carries
a settled Share, the whole delete is refused and names the offending line, rather
than removing what it can and leaving a remnant nobody asked for. This follows
D15, which likewise refuses to touch Cleared Periods, and keeps principle 4's
reversibility intact.

**A Receipt reduced to a single Transaction stays a Receipt.** Dissolving it
automatically would add a second path through the same state, which is the thing
this design has spent every other decision avoiding.

**No stored total means nothing enforces that the lines add up to the till.** A
basket entered ฿100 short simply records ฿100 less spending; there is no second
figure for it to contradict. The card's cycle then disagrees with the real
statement, which is precisely the signal D3's per-cycle adjustment and D21's
Drift exist to surface.
