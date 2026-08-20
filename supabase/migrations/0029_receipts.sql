-- D22 (DESIGN.md v4.2, ADR-0015): one payment that covered more than one
-- category.
--
-- `transactions.category_id` is a single column, so a ฿1,800 Makro charge
-- covering fresh food, snacks and a saucepan has to file the whole basket
-- under one heading. A **Receipt** groups the several transactions one payment
-- produced.
--
-- A receipt holds NO MONEY. There is deliberately no amount, no date, no
-- instrument and no category on this table: every one of them is read back
-- from the transactions carrying `receipt_id`. That is what lets every total
-- in the app keep summing a flat list of transactions and stay correct without
-- knowing receipts exist, and it is why a receipt cannot double-count -- it has
-- no number to add. The alternative (a parent row holding the full ฿1,800 above
-- children holding it again) is the shape D7 and §6.7 have each had to defuse
-- once already.

create table receipts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  label         text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references household_members(id),

  -- Supports the composite FK below, which stops a transaction pointing at
  -- another household's receipt (the trick `categories` uses for kind).
  unique (id, household_id)
);

alter table transactions add column receipt_id uuid references receipts(id);

alter table transactions
  add constraint transaction_receipt_same_household
  foreign key (receipt_id, household_id) references receipts(id, household_id);

-- A transfer carries no category (`category_iff_not_transfer`), so there is
-- nothing about it to divide.
alter table transactions
  add constraint receipt_not_on_transfer
  check (receipt_id is null or kind <> 'transfer');

create index idx_transactions_receipt_id on transactions (receipt_id) where deleted_at is null;

-- One payment happened, so its transactions share a date and an instrument.
-- A group spanning two days or two cards is not a receipt but a tag -- a
-- different axis, deliberately not designed (ADR-0015).
--
-- A trigger rather than a check constraint, for the same reason
-- `categories_enforce_hierarchy` is one: a check cannot look at sibling rows.
-- Soft-deleted siblings are ignored, so deleting a line and re-adding it on a
-- corrected date is not blocked by the row that was removed.
create or replace function transactions_enforce_receipt_shape()
returns trigger
language plpgsql
as $$
declare
  v_sibling record;
begin
  if new.receipt_id is null then
    return new;
  end if;

  select date, from_account_id, from_card_id into v_sibling
  from transactions
  where receipt_id = new.receipt_id
    and id <> new.id
    and deleted_at is null
  limit 1;

  if not found then
    return new;
  end if;

  if v_sibling.date is distinct from new.date then
    raise exception 'A receipt''s transactions must share one date (% vs %)', v_sibling.date, new.date;
  end if;

  if v_sibling.from_account_id is distinct from new.from_account_id
     or v_sibling.from_card_id is distinct from new.from_card_id then
    raise exception 'A receipt''s transactions must share one instrument';
  end if;

  return new;
end;
$$;

create trigger trg_transactions_enforce_receipt_shape
before insert or update of receipt_id, date, from_account_id, from_card_id on transactions
for each row execute function transactions_enforce_receipt_shape();

alter table receipts enable row level security;
create policy member_all on receipts
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

-- 0024 gave this view an explicit column list precisely so the next column
-- would not repeat 0022's trap. Appending at the end is what
-- `create or replace view` allows.
create or replace view v_transactions with (security_invoker = true) as
  select
    id, household_id, date, kind, category_id, category_kind, description,
    amount, owner_id, from_account_id, from_card_id, to_account_id, to_card_id,
    note, source, recurring_rule_id, occurrence_date, confirmed, created_by,
    created_at, updated_at, updated_by, deleted_at, source_key, receipt_id
  from transactions
  where deleted_at is null;

-- A receipt whose every transaction has been soft-deleted is left in place
-- rather than removed: the transactions still point at it, so undoing the
-- delete restores the whole receipt intact (principle 4). It renders nowhere,
-- having no live lines to render.
create view v_receipts with (security_invoker = true) as
  select id, household_id, label, created_at, updated_at, updated_by
  from receipts;

-- Splitting is an edit, not an entry mode (ADR-0015): the transaction already
-- exists, and converting it stamps `receipt_id` on that row rather than
-- building a parent above it, so the three foreign keys pointing at
-- `transactions.id` never move and a repaid debt survives the conversion.
--
-- One function, so the whole conversion is one Postgres transaction.
-- `trg_transaction_shares_check_sum` is deferred (0022), which is what lets
-- the original's shares be cleared and its amount reduced without the
-- intermediate state ever being judged. Doing this as three PostgREST calls
-- would leave the ledger inconsistent between them.
create or replace function split_transaction_into_receipt(
  p_transaction_id uuid,
  p_label text,
  p_lines jsonb                          -- [{category_id, amount, description}]
)
returns jsonb                            -- {receipt_id, transaction_ids: [...]} in line order
language plpgsql
set search_path = public
as $$
declare
  v_tx transactions%rowtype;
  v_receipt_id uuid;
  v_line jsonb;
  v_sum numeric(14,2) := 0;
  v_first boolean := true;
  v_ids uuid[] := '{}';
  v_new_id uuid;
begin
  select * into v_tx from transactions
  where id = p_transaction_id and deleted_at is null
  for update;

  if not found then
    raise exception 'That transaction no longer exists';
  end if;
  if v_tx.receipt_id is not null then
    raise exception 'This is already part of a receipt';
  end if;
  if v_tx.kind = 'transfer' then
    raise exception 'A transfer has no category to divide';
  end if;
  -- D15: a plan is immutable and a period's amount is the plan's to decide.
  -- Splitting one would restate it from the outside.
  if v_tx.source = 'installment' then
    raise exception 'An installment period cannot be split';
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'A receipt needs at least two lines';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sum := v_sum + (v_line->>'amount')::numeric;
  end loop;

  -- Splitting divides what was recorded; it does not restate it. Changing the
  -- total is an ordinary edit to a line, afterwards.
  if v_sum <> v_tx.amount then
    raise exception 'The lines add up to % but the transaction is %', v_sum, v_tx.amount;
  end if;

  -- Clearing the original's shares leaves zero rows, which the sum check
  -- treats as a valid state ("nobody owes anyone for this one"); the caller
  -- writes each line's own split immediately afterwards. A share that has
  -- already been settled raises here, from trg_transaction_shares_guard_settled,
  -- and takes the whole split down with it — the repayment must be undone
  -- first, which is the same rule deleting a receipt follows.
  delete from transaction_shares where transaction_id = p_transaction_id;

  insert into receipts (household_id, label, updated_by)
  values (v_tx.household_id, p_label, v_tx.updated_by)
  returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_first then
      update transactions set
        receipt_id  = v_receipt_id,
        category_id = (v_line->>'category_id')::uuid,
        amount      = (v_line->>'amount')::numeric,
        description = coalesce(v_line->>'description', description),
        updated_at  = now()
      where id = p_transaction_id;
      v_ids := v_ids || p_transaction_id;
      v_first := false;
    else
      -- Siblings were entered by hand during the split, whatever the
      -- original's Origin was, and carry no recurring link — `unique
      -- (recurring_rule_id, occurrence_date)` would reject a copied one.
      insert into transactions (
        household_id, date, kind, category_id, category_kind, description,
        amount, owner_id, from_account_id, from_card_id, note, source,
        confirmed, created_by, receipt_id
      ) values (
        v_tx.household_id, v_tx.date, v_tx.kind,
        (v_line->>'category_id')::uuid, v_tx.category_kind,
        coalesce(v_line->>'description', ''),
        (v_line->>'amount')::numeric, v_tx.owner_id,
        v_tx.from_account_id, v_tx.from_card_id, v_tx.note, 'manual',
        v_tx.confirmed, v_tx.created_by, v_receipt_id
      ) returning id into v_new_id;
      v_ids := v_ids || v_new_id;
    end if;
  end loop;

  -- The line ids come back in the order they were given, so the caller can
  -- write each line's own Split against the right row without a second
  -- round trip to work out which is which.
  return jsonb_build_object('receipt_id', v_receipt_id, 'transaction_ids', to_jsonb(v_ids));
end;
$$;

-- Deleting a receipt is one action or none (ADR-0015, following D15). A soft
-- delete never touches `transaction_shares`, so trg_transaction_shares_guard_settled
-- cannot fire and would let half a receipt go quietly; the check therefore
-- happens here, before anything is removed, and names the line that blocks it.
create or replace function delete_receipt(p_receipt_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_blocked text;
  v_count int;
begin
  select coalesce(nullif(t.description, ''), c.name, 'one of its lines')
  into v_blocked
  from transactions t
  join transaction_shares ts on ts.transaction_id = t.id
  join transactions settle on settle.id = ts.settled_by_transaction_id
  left join categories c on c.id = t.category_id
  where t.receipt_id = p_receipt_id
    and t.deleted_at is null
    and settle.deleted_at is null
  limit 1;

  if v_blocked is not null then
    raise exception 'Already settled up: undo the repayment on "%" before deleting this receipt', v_blocked;
  end if;

  update transactions set deleted_at = now()
  where receipt_id = p_receipt_id and deleted_at is null;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'That receipt no longer exists';
  end if;

  return v_count;
end;
$$;

-- The undo half of the above (principle 4). The receipt row is never removed,
-- so its lines still point at it and come back together.
create or replace function restore_receipt(p_receipt_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  update transactions set deleted_at = null
  where receipt_id = p_receipt_id and deleted_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
