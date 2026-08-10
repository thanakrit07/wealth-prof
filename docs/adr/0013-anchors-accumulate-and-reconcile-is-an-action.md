# Anchors accumulate, and Reconcile is an action

D4 exists because a hand-typed account balance drifts: *"one missed update and
the number drifts permanently."* Its answer was the reconcile pattern — store a
balance known to be true at a date, add the ledger since. Half of that shipped:
`accountBalance` computes anchor-plus-transactions. The other half never did.
The only way to move an anchor is the account's edit dialog, which exposes
`anchor_balance` and `anchor_date` as two raw fields and asks the user to
understand what an anchor is and to set the date themselves — the inverse of
§6.3, which says the user types the real balance and *the system* dates it.

**Reconcile becomes a first-class action**: enter what the bank actually says,
and the app records the rest. The word "anchor" leaves the interface.

**Anchors accumulate as rows rather than overwriting a column.** Reconciling
appends; nothing is destroyed. §6.3's formula is untouched — the current balance
is still one anchor plus every Transaction since — it simply reads the newest
row instead of a field. This supersedes §6.3's instruction to *write* a new
anchor over the old one.

What that buys is **Drift**: the gap between the balance the ledger computed and
the one that was really there. Drift is the symptom of a Transaction nobody
recorded, which is the exact failure D4 was written to catch. Overwriting the
anchor corrects the number and destroys the evidence — the household is told
they were wrong but never by how much, or how often, so a recurring fee nobody
has ever recorded stays invisible while being silently absorbed every month.

## An anchor records yesterday's close, not today's reading

A Transaction carries a `date` and no time, but a balance read from a banking
app is a figure at a *moment*. Reconciling at 15:00 with ฿5,000 says nothing
about whether the ฿65 coffee dated today is inside that number — and the two
obvious readings of the anchor are wrong in opposite directions. Treating the
day as already included (`date <= anchor_date`, which is what the code does and
what its tests pin) swallows anything recorded later that day. Treating it as
not included double-counts whatever was recorded earlier. Both errors persist
until the next reconcile.

So an anchor stores the **close of the previous day**: the figure typed, less
whatever the app has already recorded for today at the moment the button is
pressed. Every one of today's transactions — those entered before the reconcile
and those entered after it — then applies on top, and the arithmetic comes out
right in both cases. `accountBalance`'s comparison is untouched; what changed is
the number handed to it.

The row keeps **both** figures: the reading the household actually asserted, and
the derived baseline the formula consumes. Drift is measured against the
reading, because that is what was claimed to be true; the baseline is never
recomputed, so the two cannot fall out of step.

## Considered Options

**Overwriting the anchor, as §6.3 literally specifies.** Simplest — no
migration, no change to `balances.ts`. Rejected for destroying Drift, and for a
second reason that only shows up on reading the code: `accountBalance` starts at
the anchor and only ever moves forward, so pushing the anchor to today makes
every balance *before* today uncomputable. Reconciling would quietly cost the
account its history.

**Mirroring the card side with a signed adjustment row**, as
`card_cycle_adjustments` does for a Billing Cycle. Same information, more
machinery: the balance would come from two mechanisms (anchor plus adjustments)
where an anchor log needs only one. The asymmetry with cards is not an
inconsistency — it follows from the shapes. **A card's truth arrives in periods**
and old statements stay true, so a per-cycle delta is the natural record. **An
account's truth is a single number at an instant**, so a dated reading is.

## Consequences

**A migration is required**, and the existing `anchor_balance` / `anchor_date`
columns become the first row of each account's log rather than dead weight —
nothing about the current numbers changes on the day it lands.

**`accountBalance` takes the newest anchor**, so every caller keeps the same
signature and the same result. The change is where the starting point comes
from, not what the function means.

**Drift is derived, never stored.** Each new anchor is compared against what the
previous anchor plus the ledger predicted; the difference is computed on demand,
the same way Projected figures are (CONTEXT.md). Storing it would create a
second number that can disagree with the rows it came from.

**Balances rows can say how stale they are**, because "when was this last
confirmed" is now a real question with a real answer. A row past the staleness
threshold says so quietly; it does not add a second figure, so
[ADR-0012](./0012-balances-rows-answer-what-is-due-next.md)'s one-question-per-row
shape holds.
