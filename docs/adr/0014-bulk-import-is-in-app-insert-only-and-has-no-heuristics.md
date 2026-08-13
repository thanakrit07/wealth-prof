# Bulk import is in-app, insert-only, and has no heuristics

`scripts/import-sheet.ts` existed since v1 to bring the household's old
Google Sheet into the app once. It was never run against the real sheet.
Grilling it before that first run found it unsafe to run at all:

**Its `source_key` is the CSV row index** — `accounts:${i}`, `transactions:${i}`,
and so on — combined with `.upsert({ onConflict: 'household_id,source_key' })`.
Insert one row mid-sheet and every key below it shifts; re-running the import
then **overwrites the wrong record in place, keeping its id** — shares,
installment payments, and settlements stay attached to that id while the
record's identity changes underneath it. The script's own `REORDERED` check
only warns, only when the row's name happens to differ from what's already
there, and the run proceeds regardless.

**It wrote account balances to columns nothing reads.** `accounts.anchor_balance`
/ `anchor_date` predate [ADR-0013](./0013-anchors-accumulate-and-reconcile-is-an-action.md);
`useAccounts` now sources a balance from the `account_anchors` log and falls
back to zero when an account has no anchor row, which every account created
this way would have. Every imported account would have rendered as **zero plus
its transactions**, silently dropping the sheet's actual balance.

**None of its risk was under test.** The one test file covered pure label-
matching helpers; the 663 lines actually writing to the database were closures
inside a single `main()`, invoked at import time — structurally untestable
without a rewrite.

## What changes

**In-app, not a script.** A screen under Settings → Data → Import, so the
household doing the import sees what it's about to do before it does it,
instead of reading a terminal summary after the fact. `scripts/import-sheet.ts`
and its four helper files are deleted; `src/lib/import/` replaces them.

**Insert-only. This supersedes §9's "upsert, not wipe."** That instruction
existed to make re-running the import safe against half-finished sheet
exports. It is replaced by a stronger guarantee: importing only ever writes
new rows, keyed `import:<entity>:<row number>` under the same
`(household_id, source_key)` constraint the old script used, and the plan
still updates. A second run into a household that already has import rows
fails on the first collision — loudly, at the exact unique constraint the
first run's rows are protected by — rather than silently rewriting a record
whose row-index identity has already drifted. This is only safe because the
household is expected to be empty when an import runs: the household wipes
its own data outside the app first. Nothing in the app performs that wipe.

**No heuristics.** The old script guessed: an unmatched category silently
became "Other"; a note field's percentage was classified monthly-or-annual by
magnitude; a label was guessed to be a subscription by matching a fixed list
of service names; installment rows in `transactions.csv` were skipped by a
category-name match. Every guess is gone. What replaces it:

- **A template per entity** (`docs/import-templates/*.csv`, and the same
  content downloadable from the screen), generated from one field-spec module
  (`src/lib/import/fields.ts`) so the template, the column-mapping guide, and
  validation itself can never drift from each other — a test pins the
  generated template's header against the checked-in file.
- **Column mapping is a screen, not a guess baked into source.** The old
  script tried a fixed list of header spellings per field and had no fallback
  but to edit `import-sheet.ts` when a real header didn't match. The app
  auto-detects the same way, but every field is a `<select>` of the file's
  real headers, correctable without touching code.
- **Every schema constraint becomes a rejected row with a message that names
  the row and the field**, not a silent "Other" or a skip. An ambiguous
  account/card name (matching both) is an error, not the old script's
  card-wins tie-break.
- **The preview can be edited.** A cell that names a category, account, card,
  or member is a `<select>` built from names that already resolve — an edit
  cannot introduce a new invalid name, only choose an existing one. A row can
  be deleted; deleting is reversible up to the moment Apply is pressed,
  because the household is watching its own data go in, not reading about it
  after the fact.

## Considered options

**Keep upserting, fix the row-index key.** A stable key needs something the
CSV doesn't reliably have — a name is not guaranteed unique, and asking the
household to invent stable ids defeats the point of a spreadsheet import.
Insert-only sidesteps the whole problem: there is no "matching row" to find,
because there's nothing to match against on an empty household.

**Keep the heuristics, just document them better.** Rejected because the
household shaping their own sheet to a template is strictly less work than
auditing a guess after the fact — a wrong guess is invisible until its effect
shows up somewhere else in the app, while a row that fails to map is visible
immediately, in the file it came from.

## Consequences

**`scripts/import-sheet.ts`, `scripts/csv.ts`, `scripts/importCategories.ts`
(+ its test), `scripts/interestRate.ts`, and `scripts/README.md` are deleted.**
Their pure value parsers (`parseAmount`, `parseDate`, …) move to
`src/lib/import/values.ts`, now with tests; the Thai category map and the
interest-rate magnitude heuristic are dropped outright, since they were
transformations the sheet's own author can now do once, in the sheet, using
the template's guide.

**Every entity the old script imported is still importable** — categories,
accounts (with an opening balance, now written as an ordinary `source:
'reconcile'` transaction rather than to the dead anchor columns), cards,
installments (including a `periodsPaid` backfill into `installment_payments`),
recurring rules, and transactions — plus the subscription-detection and
card-payment-as-transfer conveniences are gone; a transfer or a recurring
rule is something the sheet states directly now, not something inferred from
a label.

**`csv-parse` moves from devDependencies to dependencies** — it's imported by
browser code (`src/lib/import/parseCsv.ts`, the `csv-parse/browser/esm/sync`
build) now, not just a dev-time script.

**`CONTEXT.md`'s Origin entry is unaffected.** It already reads "the one-time
import of the household's old Google Sheet," which describes what this import
does regardless of which surface runs it.
