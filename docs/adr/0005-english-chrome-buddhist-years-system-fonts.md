# The interface is English, the years are Buddhist, and the fonts are the system's

Labels, buttons and headings are written in English. Every year shown to the user
is Buddhist Era in full ("5 Aug 2569"). Category names, notes and the household
members' names are whatever the user typed, in whichever language. The bundled
Thai display faces are dropped in favour of the platform's own UI font.

## Considered Options

DESIGN §7.4 committed the opposite — "the UI is entirely in Thai" — and was never
implemented: the whole of `src/` held twelve lines of Thai, every label was
English, and `format.ts` cited §7.4 in a comment while formatting with `en-US`.
Rather than build toward a paper decision nobody had followed for a year, the doc
was changed to match what both users actually wanted.

Buddhist years are the one part of the Thai convention kept, and for a functional
reason rather than a cultural one: Thai bank statements and banking apps show BE,
so a due date in CE means reading two calendars against each other every time a
card bill is checked. Years are written in full because "5 Aug 69" reads as 1969
once the month is in English — the abbreviated form §7.4 proposed only worked
with Thai month names to anchor it.

Mitr and Prompt were bundled because the interface was going to be Thai. With
English chrome that reason is gone, and what remained was 200 KB of font for a
rounded display face used at small sizes in dense lists of figures — the worst
place for one. The platform font (SF Pro on iOS, Roboto on Android) costs nothing
to download, has the better-tuned tabular numerals, and hands Thai user data to a
proper Thai text face rather than a display one. The app looks slightly different
across the two phones as a result, which is accepted: the app's personality lives
in its colour, not its letterforms.

## Consequences

Buddhist years are a formatting concern only — dates are stored and exchanged as
ISO `yyyy-MM-dd` in CE, as they always were, and the conversion happens at the
point of display. Nothing in the database, the URL state or a query key ever sees
a BE year.

This is what forces the app to own its date picker. A native `<input type="date">`
renders the calendar of the device's locale, which the app cannot override — so
two phones with different locale settings would show different years in the same
field while every other date on screen said 2569. All six native date inputs are
replaced by one in-app picker, which also closes the gap D9 left: on the
transaction form it opens in the panel below rather than as a system overlay,
for the same reason the amount keypad does.
