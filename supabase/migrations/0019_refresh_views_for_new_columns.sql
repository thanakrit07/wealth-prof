-- The v_* views were declared as `select * from <table>`, but Postgres
-- expands `*` at creation time and freezes the column list. Every
-- `alter table ... add column` since has therefore been invisible through
-- its view:
--   * categories.color   (0018) — broke the app immediately: selecting a
--     column the view doesn't expose fails the whole categories query, so
--     every screen lost its category names and icons at once.
--   * <table>.source_key (0013) — latent, only because nothing reads
--     source_key through a view.
--
-- Recreated here with explicit column lists rather than `*`, so the next
-- added column is a visible omission in this file instead of a silent one
-- in the database. `create or replace view` permits appending columns at
-- the end, which is all these changes do.
create or replace view v_categories with (security_invoker = true) as
  select id, household_id, name, kind, icon, sort_order, archived, parent_id, color
  from categories;

create or replace view v_transactions with (security_invoker = true) as
  select id, household_id, date, kind, category_id, category_kind, description, amount, owner_id,
         from_account_id, from_card_id, to_account_id, to_card_id, note, source, recurring_rule_id,
         occurrence_date, confirmed, created_by, created_at, updated_at, updated_by, deleted_at, source_key
  from transactions
  where deleted_at is null;

create or replace view v_accounts with (security_invoker = true) as
  select id, household_id, name, type, owner_id, anchor_balance, anchor_date, sort_order, archived,
         created_at, updated_at, updated_by, deleted_at, source_key
  from accounts
  where deleted_at is null;

create or replace view v_cards with (security_invoker = true) as
  select id, household_id, name, credit_limit, statement_day, due_day, annual_interest_rate, owner_id,
         sort_order, archived, created_at, updated_at, updated_by, deleted_at, source_key
  from cards
  where deleted_at is null;

create or replace view v_installments with (security_invoker = true) as
  select id, household_id, name, category_id, start_date, total_periods, monthly_amount, final_amount,
         card_id, account_id, annual_interest_rate, is_cash_advance, owner_id, note, status,
         created_at, updated_at, updated_by, deleted_at, source_key
  from installments
  where deleted_at is null;
