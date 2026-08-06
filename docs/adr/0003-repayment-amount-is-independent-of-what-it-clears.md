# A repayment's amount is independent of the Debts it clears

In a Settlement, ticking decides which Debts are cleared and the amount records
how much money actually moved. The two are allowed to disagree; the difference is
shown to the user and nothing further is inferred from it.

## Considered Options

Forcing them to agree — the original behaviour, where the amount was computed
from the ticked items and could not be typed at all — keeps every baht traceable
to the item it paid for. It was rejected because real repayments between two
people are round numbers, and a rule that says "you may only transfer ฿487" is a
rule people work around outside the app.

Treating a shortfall as still owed was rejected too: clearing part of a single
Debt means splitting a Debt row, which is more work than everything else in this
redesign put together. Paying only part of what is owed is expressed by ticking
fewer items.

## Consequences

`v_settlements` already exposes `amount` alongside `gross_amount` and
`net_cleared` so the two can be compared, and its own comment anticipated them
diverging — a reader who finds them disagreeing is looking at a deliberate state,
not a bug. Money handed over beyond what was ticked is not tracked as credit and
will not reduce the next repayment.
