# Entry forms are full-screen pages with one shared picker panel, not a Drawer of independently-expanding rows

The Transaction, Recurring Rule and Installment Plan forms stop being a bottom
`Drawer` layered over the previous screen. Each becomes a full-screen page.
Amount, Category, Account/card and Date stop expanding inline where they sit;
tapping any of them opens the same fixed panel at the bottom of the screen,
which swaps its content between the keypad, the category grid, the instrument
list and the calendar depending on which row is active. Only one of those can
be open at a time, and opening a different row simply changes what the shared
panel shows rather than opening a second panel alongside the first. Who bears
becomes a persistent row, not a collapsible one, with a one-tap button per
other household member for "this belongs entirely to them" alongside Just
you / Split evenly / Custom. Note and Details keep the system keyboard, and
focusing either closes the shared panel if it happens to be open.

## Considered Options

D9 (v3) already committed to "every picker opens in a fixed bottom panel,"
and §7.2's original sketch drew exactly this — one panel, swapping content.
What shipped instead (declared in v3.5 to supersede that sketch) gave each
picker its own inline-expanding section: the category grid sits open in the
document flow the whole time, the date picker's calendar pushes the rows
below it down when opened, and Who bears lived behind an "Edit" tap that
also gated the date row. That shipped shape came from real dogfooding and
wasn't wrong on its own terms, but it was designed before Who bears existed
and before the two-tab collapse (Edit) had to carry a third independent
picker's worth of state. In practice: recording something on the partner's
behalf takes three taps to even reach the option (Edit → Who bears → their
name) because it is buried behind a second one meant only for Date; opening
Category permanently claims a third of the screen whether or not it's being
looked at; and opening the calendar shoves the whole form around under it
instead of the fixed-height panel D9 asked for. Money Manager, the app this
form is explicitly modelled on, does not have this problem — because it
never gave pickers their own inline real estate to begin with.

The alternative kept on the table was smaller, targeted fixes: raise Who
bears out of the Edit toggle on its own, leave Category and Date as they
are. That would have solved the one complaint raised most urgently (partner
entry) without touching the rest. It was rejected because the same root
cause — each picker inventing its own expand/collapse behaviour instead of
sharing one — would still be there for Category and Date, and a Drawer
constrained to viewport height was already the thing fighting the in-app
keypad for room on the smallest phones. Moving to a full-screen page removes
that ceiling entirely and gives the shared panel a fixed amount of screen to
occupy at the bottom regardless of how many rows sit above it.

## Consequences

Every entry form gains a single piece of state — which picker (if any) is
active — instead of one flag per picker (`activeAmount`, a date field's own
`open`, `metaOpen`). Opening one row implicitly closes any other that was
open; nothing needs to explicitly close a sibling.

The category grid is no longer visible without being asked for, so choosing
a category costs one tap it did not cost before. This is accepted: the
category a transaction should land in is rarely the same tap-count concern
as the amount or who bears it, and the grid no longer competing for space
under a rounder, smaller sheet than a full page.

Recurring Rule and Installment Plan move from a `Drawer` to the same
full-screen shape even though neither one has D9's original iOS
viewport-shove problem (they are typed into far less often). This is
deliberate consistency, not a fix for those two: three different entry
surfaces sharing one picker-panel component is worth more than each form
picking the container that suits its own frequency of use.
