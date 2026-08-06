# A Shared Instrument is a common pot, not a third owner

An account or card with `owner_id is null` is **shared**: a common pot both
members put money into and spend household costs out of. It holds no per-person
ownership breakdown. Money transferred into it stops being that person's
individually; an expense paid out of it raises **no Debt between the members**,
because the money spent was already jointly held. Who has contributed how much
is answerable from the ledger — each contribution is an ordinary transfer
carrying its own `owner_id` — but it is a report, not a stored balance, and
nothing in the app divides the pot's balance between the two people.

This is deliberately scoped to a joint **spending** account. A joint
**investment** account is not covered and is left undesigned (see Consequences).

## Considered Options

`owner_id is null` for instruments predates all of this (§4.2's original
ownership convention) and had drifted into meaning nothing in particular: it was
selectable in the UI as "Shared", showed up nowhere on any screen, and quietly
suppressed debt creation with no visible cue. The choice was never "add shared
accounts or not" — the state already existed and was already reachable. It was
"give it a meaning, or delete it."

**A third pseudo-member.** Add a real `household_members` row named "Shared"
with no `user_id`, so sharedness is a selectable thing like a person rather than
a null. Rejected: it walks straight back into the `P1 / P2 / Shared` bucket
model that D14 deleted. It breaks the invariant that one person's figures plus
the other's equal the household's — a third bucket means they no longer add up.
`transaction_shares.member_id` could point at it, producing meaningless rows
("Shared bears ฿500", "Earth owes Shared"). It cannot express 70/30, which is
the exact limitation that made D13 abandon null-as-shared for transactions. And
because it would have to be filtered out of every Who-bears and owner picker in
the app, it is not really a member — it is `owner_id is null` again, with more
moving parts.

**An ownership ratio on the instrument.** Store a `RatioSplit`
(`[{member_id, ratio}]`, the shape migrations 0026 already uses for plans) on
the account, so a joint account could say 50/50 and a joint investment 70/30.
Rejected after working an example: the moment either person transfers more money
in, the stored ratio is wrong and has to be re-typed by hand. That is precisely
the failure D4 exists to prevent — "one missed update and the number drifts
permanently". A proportion of a pot is an *output* of the ledger, never an input
to it.

**The common pot (chosen).** Keep `owner_id is null`, and take seriously what it
already implies. Contributions are already recorded as transfers with an owner;
consumption is already recorded as Splits. Both facts are in the ledger, so any
"who put in what" view is derivable and nothing new needs storing. Critically,
this is not a change to the database at all — `v_share_debts` (0023) already
ends with `coalesce(c.owner_id, a.owner_id) is not null`, so an expense paid from
a shared instrument produces no debt row today. The decision documents behaviour
the schema already has and the UI never surfaced.

## Consequences

`owner_id` on an instrument keeps its job, but the question it answers is
sharper than "whose is this": it is **who fronted the money**, which is what
decides whether a Debt arises. A single-owner instrument means that person paid
and may be owed; a shared one means nobody individually did, so nobody is owed.

Shares are still written for expenses paid from the pot. They are what makes the
person filter mean Borne (D14) — "we spent ฿300 of the household's money on
groceries, ฿150 of it mine" is a true and useful statement. They simply never
become debts, which `v_share_debts` already guarantees.

The pot's balance belongs to no one in particular, so it cannot sit under either
person on Balances. It gets its own section, visible under every person filter,
and is excluded from either individual's own total. A household of two who never
open a joint account never sees that section at all.

**Joint investment accounts do not work under this model, and that is accepted
for now.** A pot that grows raises "whose is the gain?", which has no answer
without per-person proportions — the very thing this decision refuses to store.
Solving it means either reviving the ratio idea with derived (not typed)
proportions, or recording gains as one income transaction per person and leaving
ADR-0002 alone. Neither is designed. If a joint investment account is opened,
this ADR is the thing to revisit first.
