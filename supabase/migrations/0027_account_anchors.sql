-- ADR-0013: an account's anchor becomes a log, not a column. Reconciling
-- appends a row instead of overwriting `accounts.anchor_balance` /
-- `anchor_date`, so Drift survives being corrected and historic balances
-- stay computable (accountBalance only ever moves forward from an anchor).
--
-- Two figures per row, not one:
--   reading_balance / reading_date  — what the household actually asserted
--                                      ("the bank app says ฿5,000 today")
--   baseline_balance / baseline_date — what accountBalance consumes: the
--                                      close of the day *before* reading_date,
--                                      after backing out whatever was already
--                                      recorded for reading_date itself.
-- A Transaction carries only a date, not a time, so a reading taken partway
-- through today cannot be compared against "everything up to today" without
-- either swallowing what's recorded after the reading or double-counting
-- what's recorded before it. Storing the previous day's close sidesteps the
-- question instead of picking a wrong answer to it — every one of today's
-- transactions, entered before or after the reconcile, applies on top of the
-- same baseline exactly once.
create table account_anchors (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  account_id       uuid not null references accounts(id) on delete cascade,
  reading_balance  numeric(14,2) not null,
  reading_date     date not null,
  baseline_balance numeric(14,2) not null,
  baseline_date    date not null,
  note             text,
  created_by       uuid references household_members(id),
  created_at       timestamptz not null default now(),

  -- baseline_date is the close of the day *before* reading_date (or, for a
  -- backfilled row, the same day — see the backfill comment below). Either
  -- way it can never fall after the reading it was derived from; a bug that
  -- swapped the two would silently corrupt every accountBalance call after it.
  constraint baseline_not_after_reading check (baseline_date <= reading_date)
);

-- accountBalance always wants "the newest anchor for this account" — one
-- index serves both that lookup and the per-account history list.
create index account_anchors_account_id_baseline_date_idx
  on account_anchors (account_id, baseline_date desc);

alter table account_anchors enable row level security;
create policy member_all on account_anchors
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- Backfill: each account's current anchor_balance/anchor_date becomes the
-- first row of its log. The old column's semantics already excluded its own
-- date going forward (`t.date <= anchor_date` in accountBalance), which is
-- exactly what baseline_date means here — so this is a rename, not a
-- reinterpretation, and no account's computed balance changes on the day
-- this migration lands. There is nothing to derive a reading from at seed
-- time, so reading = baseline for every backfilled row; Drift is only
-- meaningful from the first real Reconcile onward.
insert into account_anchors (household_id, account_id, reading_balance, reading_date, baseline_balance, baseline_date, created_at)
select household_id, id, anchor_balance, anchor_date, anchor_balance, anchor_date, created_at
from accounts;

create view v_account_anchors with (security_invoker = true) as
  select * from account_anchors;
