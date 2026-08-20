-- `transactions_enforce_receipt_shape` (0029) shipped without a pinned
-- search_path, which the database linter flags as
-- `function_search_path_mutable`. The same omission has been corrected twice
-- before — 0016 for the category hierarchy trigger, 0025 for the
-- transaction_shares guard — and the three receipt RPCs in 0029 were pinned;
-- only the trigger function was missed.
--
-- Its own migration rather than an edit to 0029, which has already been
-- applied to production: rewriting an applied migration would leave the local
-- chain and the real database describing different histories.
create or replace function transactions_enforce_receipt_shape()
returns trigger
language plpgsql
set search_path = public
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
