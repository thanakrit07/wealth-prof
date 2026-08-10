# Desktop is three regions, not a stretched phone

Above `lg` (64rem) the app lays out as **nav rail · ledger · summary column**.
Below it, the shell is exactly what it was: bottom nav, floating FAB, safe-area
insets, nothing changed. This delivers the line §7.3 has carried since v3.5 —
*"Desktop: the bottom nav becomes a sidebar and content goes two-column"* — which
had been a promise for two versions with no code behind it.

Before this, app code contained **one** breakpoint class in total, no `@media`
rules and no media-query hook. `AppShell` hardcoded mobile at five points: a
`min-h-svh` root, a `pb-…+9rem` magic number coupled to the FAB's height, a
`fixed` FAB, a `fixed` bottom nav, and safe-area insets throughout. On a laptop
the app rendered as a phone screen stretched to 1920px.

The `--sidebar-*` OKLCH token set, present in `index.css` since the first commit
with zero consumers, finally has one.

## Considered Options

**Pure CSS, no JavaScript.** `hidden lg:flex` on the rail, `lg:hidden` on the
bottom nav — no hook, no re-render, works before hydration. Rejected for the nav
specifically: both would exist in the DOM, so a screen reader would find **two
`<nav>` landmarks** and offer the user a choice between them, one of which is
invisible. Landmarks are exactly the thing a CSS-only toggle gets wrong. So a
small `useIsDesktop` hook (`useSyncExternalStore`, matching the existing
`useOnline`) gates the swap in JavaScript, and CSS-only gating is still used for
everything that is *not* a landmark — `SummaryColumn` is a plain `hidden lg:flex`.

**A desktop-specific component tree.** Rejected: two trees means every future
change is made twice and drifts once. The screens are the same components; only
the shell differs, and it differs by an early return.

**Letting the summary column mount on mobile and hiding it with CSS.** Rejected
because `RecordsSummary` fetches its own data — a hidden column would still run
every query on a phone, on the tab people open most.

## Consequences

**Records' month summary became a component with two hosts.** `RecordsSummary`
renders inline above the ledger on mobile and inside the summary column on
desktop, deriving everything from `month`/`person`/`card`/`cardCycle` rather than
receiving it. `App.tsx` decides which host, using the same `isDesktop` flag the
shell uses internally, so it is never mounted twice.

**Screen roots gained `mx-auto max-w-2xl`.** Every one was a bare `p-4`, so on a
wide screen a two-column ledger row stretched to the full width and became
unreadable.

**The FAB has no desktop equivalent, deliberately.** A floating action button
over a mouse-driven layout is a phone idiom; the rail carries a labelled "New
record" instead. `CardForecastTab`'s `pr-20` FAB-dodge becomes `lg:pr-0` as a
result — the clearance exists only where the FAB does.

**`SwipeableRow` had to grow a non-touch route to Delete.** It set `aria-hidden`
and `tabIndex={-1}` on the delete button until swiped open, which only a
touchscreen can do — so on the platform this ADR adds, there was no way to reach
it at all. It now reveals on hover and on focus.

**`EntryPage` gets a second shape.** A full-bleed page dismissed by an edge swipe
makes no sense with a mouse, so above `lg` it is a centred dialog and the shared
bottom picker panel becomes a side column — using `panelOpen`, the boolean all
three sheets already thread through, so no new state exists. The mobile path is
untouched, including the portal to `document.body` that v3.8 added for iOS
Safari.
