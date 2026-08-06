-- An uneven Custom split (D13) has nowhere to live on a Recurring Rule or
-- Installment Plan yet -- every period/occurrence still resolves through
-- computeShareRows' owner_id heuristic (0024: null = split evenly, owner
-- distinct from the paying instrument's owner = a borrow), which can only
-- ever express an even split or one person bearing the whole thing.
--
-- `split` carries a ratio breakdown -- [{member_id, ratio}], ratios summing
-- to 1 -- rather than fixed amounts, because a plan's periods don't all
-- carry the same amount (the final period absorbs a rounding remainder,
-- ADR-0001) and a rule's own amount can vary release to release. Applying
-- the same ratios to whatever a given period/occurrence actually charges is
-- the materialiser's job (src/lib/transactionShares.ts), the same
-- remainder-absorbing rounding as an even Split. `null` (the default) keeps
-- every existing plan on the owner_id heuristic unchanged -- this is
-- additive, not a replacement for it.

alter table installments add column split jsonb;
alter table recurring_rules add column split jsonb;

alter table installments drop constraint if exists installments_split_shape;
alter table installments add constraint installments_split_shape check (
  split is null or jsonb_typeof(split) = 'array'
);
alter table recurring_rules drop constraint if exists recurring_rules_split_shape;
alter table recurring_rules add constraint recurring_rules_split_shape check (
  split is null or jsonb_typeof(split) = 'array'
);

create or replace view v_installments with (security_invoker = true) as
  select id, household_id, name, category_id, start_date, total_periods, monthly_amount, final_amount,
         card_id, account_id, annual_interest_rate, is_cash_advance, owner_id, note, status,
         created_at, updated_at, updated_by, deleted_at, source_key, split
  from installments
  where deleted_at is null;

-- v_recurring_rules (0007) was still `select *`, the exact trap 0019 fixed
-- for the other views -- Postgres freezes a view's column list at CREATE
-- time, so it never picked up source_key (0021) either. Recreated with an
-- explicit list, split appended, source_key included as the same fix.
drop view if exists v_recurring_rules;
create view v_recurring_rules with (security_invoker = true) as
  select id, household_id, name, kind, category_id, category_kind, amount, owner_id,
         from_account_id, from_card_id, to_account_id, to_card_id, note, freq, interval,
         day_of_month, month_of_year, weekday, month_end, start_date, end_date, max_occurrences,
         auto_post, variable_amount, active, last_generated_date, created_at, updated_at,
         updated_by, deleted_at, source_key, split
  from recurring_rules
  where deleted_at is null;
