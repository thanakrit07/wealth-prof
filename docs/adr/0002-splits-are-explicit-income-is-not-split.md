# A Transaction carries an explicit Split; income carries none

Who bears an expense is recorded as explicit per-Member amounts, written when the
Transaction is entered rather than inferred from a null owner meaning "shared".
Portions need not be equal. Income cannot be split at all: it lands in one
Instrument and belongs to that Instrument's Owner, and anything that must reach
the other Member is recorded as a transfer.

## Considered Options

The previous model made `owner_id = null` mean "shared" and had a database
trigger divide the amount evenly among every Member. It could not express an
uneven split, and it could not tell "we share this" apart from "nobody said whose
this is" — which is why `debt_exempt` had to be added, so importing years of
unattributed history did not open as a wall of debts. Writing the Split down
instead of inferring it removes both problems and the column that patched them.

Supporting shared income was considered separately. On income the money lands in
the Instrument Owner's account, so the Owner becomes the debtor and the direction
of every Debt inverts — doubling the cases that every screen touching Debt has to
handle, for a situation this household meets once or twice a year.

## Consequences

`debt_exempt` and the even-division trigger both go. The trigger that remains
only fills in a default Split on insert; the application owns the rows after
that, and the guard against rewriting an already-settled Split moves off the
Transaction and onto the Split itself.
