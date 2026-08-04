-- D12 (DESIGN.md v3.3): debts between household members, and repaying them.
--
-- `transaction_shares` records **who consumed the money** in a transaction:
--
--   shared expense (owner_id is null)          one row per member, split evenly
--   personal expense on someone else's card    one row, the owner, full amount
--   personal expense on their own instrument   no rows
--   transfers, and soft-deleted rows           no rows
--
-- A *debt* is then any share whose member is not the owner of the instrument
-- that actually paid -- one rule covering both "your half of the groceries"
-- and "you put your own shopping on my card". The views in 0023 read it.
--
-- Repayment is a real `transfer` transaction and nothing else: shares point at
-- it via settled_by_transaction_id, so the ledger is the audit trail and there
-- is no parallel record to drift from it. D2 made the same call for installment
-- periods -- an event, linked to the money that moved, never a flag.
--
-- Deliberately independent of the card-bill machinery (§6.1/§6.5): a card's
-- statement is every charge on it whoever consumed them -- that debt is between
-- the cardholder and the bank, and is settled by paying the bank, not by
-- anything here.

-- Lets a transaction opt out of generating a debt without disturbing the split
-- it still contributes to the per-person totals. Needed because the sheet
-- import (scripts/import-sheet.ts) leaves owner_id null on any row with no
-- person named, which would otherwise turn years of history into open debts.
alter table transactions add column debt_exempt boolean not null default false;

-- v_transactions (0007) is `select * from transactions`, but a view's column
-- list is fixed at CREATE time in Postgres -- it does not pick up a column
-- added to the underlying table later on its own. Without this, every read
-- through the view (i.e. every read the app does) 400s on debt_exempt.
create or replace view v_transactions with (security_invoker = true) as
  select * from transactions where deleted_at is null;

create table transaction_shares (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,  -- denormalised for RLS (§4.7)
  transaction_id uuid not null references transactions(id) on delete cascade,
  member_id      uuid not null references household_members(id),
  share_amount   numeric(14,2) not null check (share_amount > 0),
  -- The transfer that repaid this share. Whether it counts as settled is
  -- decided in the view, not here: the app soft-deletes, so `on delete set
  -- null` would almost never fire and an undone repayment has to release its
  -- shares by having the view ignore a soft-deleted transfer.
  settled_by_transaction_id uuid references transactions(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (transaction_id, member_id)
);

create index idx_transaction_shares_transaction_id on transaction_shares(transaction_id);
create index idx_transaction_shares_settled_by on transaction_shares(settled_by_transaction_id);
create index idx_transaction_shares_member on transaction_shares(household_id, member_id);

-- One function owns this table. Earlier revisions split the work across three
-- triggers (require-shared-owner / drop-when-unshared / rescale-on-amount) and
-- two of them deadlocked each other: one emptied the table while the other
-- insisted it still summed to the transaction amount.
create or replace function transactions_sync_shares()
returns trigger
language plpgsql
as $$
declare
  v_instrument_owner uuid;
  v_wanted uuid[] := array[]::uuid[];
  v_existing uuid[] := array[]::uuid[];
  v_n int;
  v_total_cents bigint;
  v_old_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
  v_running bigint := 0;
  v_cents bigint;
  v_last_id uuid;
  v_settled int;
  r record;
begin
  -- Who fronted the money.
  select coalesce(
    (select owner_id from cards    where id = new.from_card_id),
    (select owner_id from accounts where id = new.from_account_id)
  ) into v_instrument_owner;

  -- Who should hold a share. A transfer never generates one -- otherwise a
  -- repayment would create a fresh debt of its own, forever.
  if new.deleted_at is null and new.kind <> 'transfer' then
    if new.owner_id is null then
      select coalesce(array_agg(id order by id), array[]::uuid[]) into v_wanted
      from household_members where household_id = new.household_id;
      -- Nobody to share with.
      if coalesce(array_length(v_wanted, 1), 0) < 2 then
        v_wanted := array[]::uuid[];
      end if;
    elsif v_instrument_owner is not null and v_instrument_owner <> new.owner_id then
      v_wanted := array[new.owner_id];
    end if;
  end if;

  select coalesce(array_agg(member_id order by member_id), array[]::uuid[]) into v_existing
  from transaction_shares where transaction_id = new.id;

  -- Nothing worth rewriting.
  if tg_op = 'INSERT' and coalesce(array_length(v_wanted, 1), 0) = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and v_wanted = v_existing and new.amount = old.amount then
    return null;
  end if;

  -- Rewriting a share somebody has already paid would restate a settled fact.
  select count(*) into v_settled
  from transaction_shares ts
  join transactions st on st.id = ts.settled_by_transaction_id and st.deleted_at is null
  where ts.transaction_id = new.id;

  if v_settled > 0 then
    raise exception 'This has already been settled up. Undo the repayment before changing it.';
  end if;

  -- Same people, new amount: restate in place so the rows -- and any
  -- settlement link on them -- survive. Proportional, in satang, because
  -- rounding each row on its own drifts off the total the check below wants.
  if tg_op = 'UPDATE' and v_wanted = v_existing then
    v_total_cents := round(new.amount * 100);
    v_old_cents   := round(old.amount * 100);
    for r in select id, share_amount from transaction_shares
             where transaction_id = new.id order by id
    loop
      v_cents := floor(r.share_amount * 100 * v_total_cents / v_old_cents);
      update transaction_shares set share_amount = v_cents / 100.0 where id = r.id;
      v_running := v_running + v_cents;
      v_last_id := r.id;
    end loop;
    if v_running <> v_total_cents then
      update transaction_shares
      set share_amount = share_amount + (v_total_cents - v_running) / 100.0
      where id = v_last_id;
    end if;
    return null;
  end if;

  -- Different people: rebuild.
  delete from transaction_shares where transaction_id = new.id;

  v_n := coalesce(array_length(v_wanted, 1), 0);
  if v_n = 1 then
    -- A borrow: the whole expense belongs to whoever owns it.
    insert into transaction_shares (household_id, transaction_id, member_id, share_amount)
    values (new.household_id, new.id, v_wanted[1], new.amount);
  elsif v_n > 1 then
    v_total_cents := round(new.amount * 100);
    v_base_cents  := v_total_cents / v_n;
    v_remainder   := v_total_cents - v_base_cents * v_n;
    -- Zero shares are dropped rather than stored: they would fail the
    -- positive-amount check without changing the total (an amount too small
    -- to divide, e.g. one satang between two people).
    insert into transaction_shares (household_id, transaction_id, member_id, share_amount)
    select new.household_id, new.id, v_wanted[i],
           (v_base_cents + case when i <= v_remainder then 1 else 0 end) / 100.0
    from generate_series(1, v_n) as i
    where (v_base_cents + case when i <= v_remainder then 1 else 0 end) > 0;
  end if;

  return null;
end;
$$;

-- Two triggers, one function: a WHEN clause cannot reference OLD on insert,
-- and the update path is worth filtering so ordinary edits (a note, a
-- category) do not touch shares at all.
create trigger trg_transactions_sync_shares_insert
after insert on transactions
for each row execute function transactions_sync_shares();

create trigger trg_transactions_sync_shares_update
after update on transactions
for each row
when (
  old.owner_id        is distinct from new.owner_id
  or old.amount          is distinct from new.amount
  or old.kind            is distinct from new.kind
  or old.from_card_id    is distinct from new.from_card_id
  or old.from_account_id is distinct from new.from_account_id
  or old.deleted_at      is distinct from new.deleted_at
)
execute function transactions_sync_shares();

-- A transaction's shares must add up to it. Deferred, so the rebuild above is
-- judged on its finished state rather than mid-delete.
create or replace function transaction_shares_check_sum()
returns trigger
language plpgsql
as $$
declare
  v_transaction_id uuid;
  v_amount numeric(14,2);
  v_sum numeric(14,2);
  v_count int;
begin
  v_transaction_id := coalesce(new.transaction_id, old.transaction_id);

  select count(*), coalesce(sum(share_amount), 0) into v_count, v_sum
  from transaction_shares where transaction_id = v_transaction_id;

  -- No shares is a valid state: nobody owes anyone for this one.
  if v_count = 0 then return null; end if;

  select amount into v_amount from transactions where id = v_transaction_id;
  -- The parent may have been deleted in the same statement, cascading here.
  if v_amount is null then return null; end if;

  if v_sum <> v_amount then
    raise exception 'transaction_shares for transaction % sum to % but the transaction amount is %',
      v_transaction_id, v_sum, v_amount;
  end if;
  return null;
end;
$$;

create constraint trigger trg_transaction_shares_check_sum
after insert or update or delete on transaction_shares
deferrable initially deferred
for each row execute function transaction_shares_check_sum();

alter table transaction_shares enable row level security;
create policy member_all on transaction_shares
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());
