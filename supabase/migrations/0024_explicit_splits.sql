-- D13/D16 (DESIGN.md v3.4, ADR-0002, ADR-0003): splits become something the
-- app writes explicitly, not something a trigger infers from a null owner.
--
-- The trigger this drops (`transactions_sync_shares`, 0022) inferred a share
-- breakdown from `owner_id` on every insert and update, and — because its
-- condition was `kind <> 'transfer'` rather than `kind = 'expense'` — it
-- created debts on *income* too, which ADR-0002 says should never happen.
-- The replacement: the application computes the same breakdown
-- (`computeShareRows` in src/lib/transactionShares.ts) and writes
-- `transaction_shares` itself, in the same request that writes the
-- transaction. The database's job shrinks to enforcing invariants on
-- whatever the app wrote — the sum-matches-total constraint (0022, kept
-- unchanged) and a new guard against rewriting a share that is already
-- settled, moved here from blocking the *transaction* to blocking the
-- *share* (ADR-0002) so an unrelated edit to a settled transaction (its
-- note, its category) is no longer collateral damage.
--
-- `debt_exempt` (0022) existed to stop the sheet import's unattributed rows
-- from opening as a wall of debts. That ambiguity no longer exists: import
-- now assigns every row a single explicit owner, so nothing it writes can
-- become a debt in the first place, and the interactive form's "not a debt"
-- case is simply not writing a share row. The column is dropped.

drop trigger if exists trg_transactions_sync_shares_insert on transactions;
drop trigger if exists trg_transactions_sync_shares_update on transactions;
drop function if exists transactions_sync_shares();

-- D16: a Debt counts only once its transaction is confirmed (not an
-- unreviewed recurring estimate) and due (not a future instalment period
-- posted ahead per ADR-0001) — this is what stops a 10-period shared plan
-- from opening ฿10,000 of debt on the day it's created. `debt_exempt` drops
-- out of the WHERE clause here (ahead of the column drop below, since a view
-- referencing a column blocks dropping it).
create or replace view v_share_debts with (security_invoker = true) as
  select
    ts.id,
    ts.household_id,
    ts.transaction_id,
    ts.settled_by_transaction_id,
    ts.member_id                     as owes_member_id,
    coalesce(c.owner_id, a.owner_id) as owed_member_id,
    ts.share_amount                  as amount,
    case when t.owner_id is null then 'split' else 'borrow' end as debt_kind,
    t.date,
    t.amount                         as transaction_amount,
    t.note,
    t.description,
    t.category_id
  from transaction_shares ts
  join transactions t on t.id = ts.transaction_id and t.deleted_at is null
  left join cards c on c.id = t.from_card_id
  left join accounts a on a.id = t.from_account_id
  where t.kind = 'expense'
    and t.confirmed
    and t.date <= current_date
    and coalesce(c.owner_id, a.owner_id) is not null
    and ts.member_id <> coalesce(c.owner_id, a.owner_id);

-- A share that has already been settled must not be silently rewritten —
-- the transfer that settled it recorded a specific amount against a specific
-- breakdown. Clearing `settled_by_transaction_id` (undoing the repayment) is
-- always allowed; that's the one update the settle-up flow itself performs.
create or replace function transaction_shares_guard_settled()
returns trigger
language plpgsql
as $$
declare
  v_still_live boolean;
begin
  if tg_op = 'DELETE' then
    select exists(
      select 1 from transactions
      where id = old.settled_by_transaction_id and deleted_at is null
    ) into v_still_live;
    if old.settled_by_transaction_id is not null and v_still_live then
      raise exception 'This has already been settled up. Undo the repayment before deleting it.';
    end if;
    return old;
  end if;

  -- UPDATE: block only a change to the breakdown itself while still settled.
  -- Nulling settled_by_transaction_id (the undo action) is always permitted.
  if old.settled_by_transaction_id is not null
     and (new.member_id is distinct from old.member_id or new.share_amount is distinct from old.share_amount)
  then
    select exists(
      select 1 from transactions
      where id = old.settled_by_transaction_id and deleted_at is null
    ) into v_still_live;
    if v_still_live then
      raise exception 'This has already been settled up. Undo the repayment before changing it.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_transaction_shares_guard_settled
before update or delete on transaction_shares
for each row execute function transaction_shares_guard_settled();

-- v_transactions (0007) is `select *`, whose column list is pinned at CREATE
-- time (0022's own comment) — dropping debt_exempt below needs this gone
-- first, and it's rewritten with an explicit list so the next column doesn't
-- repeat the trap.
drop view v_transactions;
create view v_transactions with (security_invoker = true) as
  select
    id, household_id, date, kind, category_id, category_kind, description,
    amount, owner_id, from_account_id, from_card_id, to_account_id, to_card_id,
    note, source, recurring_rule_id, occurrence_date, confirmed, created_by,
    created_at, updated_at, updated_by, deleted_at, source_key
  from transactions
  where deleted_at is null;

alter table transactions drop column debt_exempt;
