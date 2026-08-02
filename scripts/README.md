# Sheet import

Imports the old Google Sheet into the app (DESIGN.md §9). Upsert, not wipe:
safe to re-run after fixing a CSV.

## 1. Export four CSVs

From the Google Sheet, export these tabs to CSV and place them in a local
`import-data/` folder at the repo root (gitignored — never committed):

```
import-data/
  accounts.csv
  credit-card.csv
  installment.csv
  transactions.csv
```

## 2. Dry-run first

```bash
IMPORT_EMAIL=you@example.com IMPORT_PASSWORD=yourpassword npm run import:sheet -- --dir ./import-data --dry-run
```

Resolves and validates every row exactly as a real run would, then writes
nothing. It reports what it would insert vs update, plus warnings for the
failures that would otherwise be silent:

* **REORDERED** — a `source_key` that currently belongs to a differently
  named record. `source_key` is the CSV row *index*, so it only means
  anything while row order holds; if the sheet has been reordered, the
  upsert overwrites the wrong record **in place** (same id, so everything
  stays linked to it while its identity changes underneath). Fix the row
  order before running for real.
* **Installment period already posted by the app** — every active plan's
  periods are generated as transactions automatically, so the same charge
  in `transactions.csv` is a duplicate under a different `source_key` and
  nothing dedupes it. Remove those rows.
* **Installment with no category** — imports fine, then never posts a
  single period (an expense with no category is rejected by the database,
  so the materialiser skips the plan).
* **Unknown transaction category** — does not fail; lands silently in
  "Other".
* **Account balance anchor reset** — re-importing `accounts.csv` overwrites
  the balance with the CSV value dated today, discarding any reconciliation.

## 3. Run it

```bash
IMPORT_EMAIL=you@example.com IMPORT_PASSWORD=yourpassword npm run import:sheet -- --dir ./import-data
```

Runs as your own signed-in account (not an admin bypass), so it can only
write into your own household.

## 4. Read the summary

The script prints ok/failed counts per tab, up to 50 parse failures with
the reason, and any transaction whose description/category looks like a
recurring item (salary, insurance, subscriptions) — add those as
recurring rules yourself in Plan → Recurring; the import never creates
rules silently.

## Column headers are a best guess

The actual header names in your sheet export aren't known yet.
`pick()` in `scripts/csv.ts` tries several likely spellings (English and
Thai) per field. If a field comes back empty in the summary:

1. Open the CSV, find the real header text.
2. Add it to that field's candidate list in `scripts/import-sheet.ts`
   (search for the field name, e.g. `pick(row, ['name', 'ชื่อ', ...])`).
3. Re-run — it's idempotent.

## Interest rate unit assumption

The sheet mixes monthly rates ("installment 0.74%") and rates that are
already annual ("9.99%" cash advances). `scripts/interestRate.ts` guesses
by magnitude: a note percentage below 3 is treated as monthly and
multiplied by 12; at or above 3, it's used as-is and the installment is
flagged `is_cash_advance`. Verify against a few known plans after the
first run and adjust `MONTHLY_THRESHOLD` if it misclassifies anything.

## Card-payment detection

A transaction is recorded as a `transfer` (not an expense — DESIGN §4.3
D7) when its description matches "payment/ชำระ/จ่ายบัตร" *and* its category
column names an existing card. If your sheet marks card payments a
different way, adjust the `looksLikeCardPayment` check in
`import-sheet.ts`.
