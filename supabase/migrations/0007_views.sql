-- Soft-delete views (§4.8): all application reads go through these, never
-- the base tables, so a deleted row never has to be filtered per-screen.
--
-- security_invoker = true is required: without it, Postgres evaluates RLS
-- as the view owner (which created it, and bypasses RLS), not the querying
-- user, silently exposing every household's rows through the view.

create view v_accounts with (security_invoker = true) as
  select * from accounts where deleted_at is null;

create view v_cards with (security_invoker = true) as
  select * from cards where deleted_at is null;

create view v_categories with (security_invoker = true) as
  select * from categories where archived is false;

create view v_transactions with (security_invoker = true) as
  select * from transactions where deleted_at is null;

create view v_recurring_rules with (security_invoker = true) as
  select * from recurring_rules where deleted_at is null;

create view v_installments with (security_invoker = true) as
  select * from installments where deleted_at is null;

create view v_budgets with (security_invoker = true) as
  select * from budgets;
