# Navigation is three tabs split by time horizon

The bottom nav is **Records** (what happened, scoped to a month), **Balances**
(what is true right now), and **Upcoming** (what is already committed ahead).
Every screen belongs to exactly one horizon, which is what decides whether the
month header appears: Records has it, the other two never do.

## Considered Options

The previous five tabs — Records, Overview, Accounts, Plan, Settings — grouped
screens by the kind of object they held rather than by when that object mattered.
That produced four problems that were each individually small and together made
the app hard to keep straight:

- Card bills appeared on both Overview and Plan, where "due this month" was
  literally the first row of the six-month list on the other tab.
- Plan was a drawer holding card bills, recurring rules and installments, so a
  plan sat two taps deep.
- Settings held a tab despite being opened once a month, while the most frequent
  action in the app needed a floating button.
- The month filter was global state that applied to two tabs out of five, so
  whether the header meant anything was something the user had to remember per
  screen.

Keeping five tabs and only removing the duplicated card bills was the cheaper
option and was rejected: it fixes the smallest of the four problems and leaves
the confusing part — a month header that means nothing on three screens.

## Consequences

Overview stops being a tab and becomes the head of Records: a one-line month
summary and a collapsed category row above the day-grouped list, both expandable
in place. Records therefore carries the most above its first row of content, and
that is the cost of the arrangement — it is why the summary is one line rather
than three.

Debts move to Balances, where they belong: what one person owes another is a
current-state figure like an account balance, not something that happened in a
particular month. On Overview they sat under a month header they deliberately
ignored, which read as a bug every time.
