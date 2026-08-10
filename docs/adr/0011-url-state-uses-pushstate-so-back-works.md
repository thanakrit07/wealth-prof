# URL state uses pushState, and Back is a supported gesture

`useUrlState` wrote every change with `history.replaceState` and nothing in the
app listened for `popstate`. Both halves of that are needed for the browser's
Back button to do anything, so **Back did nothing, anywhere in the app** — it
left the app entirely, back to whatever page preceded it. Switching tab, changing
month, opening a card, applying a category filter: all of them replaced the same
single history entry.

It now pushes, and listens.

The bug was invisible on the platform the app was built for. A phone user reaches
for the edge-swipe gesture, and the full-screen entry pages implement that
themselves ([ADR-0006](./0006-full-screen-entry-with-one-shared-picker-panel.md)),
so the one back-shaped affordance people used worked. On a desktop
([ADR-0010](./0010-desktop-is-three-regions.md)) there is no edge swipe, the Back
button is the primary way to undo navigation, and it was inert.

## One user action is one Back press

A literal `replaceState` → `pushState` swap is not enough, and the reason is
worth recording because it is not visible from the hook alone. Several call sites
change **two** pieces of URL state in one handler — `App.tsx`'s `onOpenAccount`
sets both `acct` and `tab` — and each is its own hook instance with its own key.
Pushing per *call* would push two entries for one tap, so undoing one action
would take two Back presses, and the intermediate state (account selected, still
on the Balances tab) is one the user never saw and cannot make sense of.

So updates from the same synchronous batch are collected at module scope and
flushed in a single `queueMicrotask`, producing one history entry per user
action regardless of how many keys it touched.

## Considered Options

**A router.** React Router or TanStack Router would give this and more. Rejected
as disproportionate: the app has three tabs and a handful of query params, no
nested routes and no route-level data loading. The hook is sixty lines including
its comments; a router is a dependency, a rewrite of `App.tsx`, and a new set of
things to know.

**Pushing only for "large" navigations** (tab changes) and replacing for
"small" ones (month, person filter). Rejected because the line is not the user's
line — someone who steps forward three months and wants to step back expects
Back to work, and a rule about which changes are worth remembering is a rule they
have to learn.

**Debouncing with a timer instead of a microtask.** Rejected: a timeout long
enough to catch a paired update is long enough to swallow a genuine second action
from a fast user, and short enough to be flaky under load. The microtask boundary
is exactly "the same synchronous batch", which is exactly the condition that
defines one action.

## Consequences

**`popstate` resyncs React state, not just the URL.** Reading the URL back into
each hook's `useState` on `popstate` is what makes the tab highlight, the month
header and the filter chips actually move — without it the address bar would
change and the screen would not.

**History grows during a session**, one entry per action, which is what a browser
is supposed to do. Nothing depends on the depth.

**Anything added to URL state gets Back for free**, and gets it *right* for free
— including the collapsing behaviour — as long as it goes through `useUrlState`
rather than touching `history` directly.
