-- Pins search_path on the transaction_shares functions, matching the
-- convention 0016 already established for the categories triggers: an unset
-- search_path lets a role-level search_path override which `transactions`/
-- `transaction_shares` the function resolves, which is exactly the kind of
-- surprise a trigger enforcing a financial invariant should never have.

create or replace function transaction_shares_check_sum()
returns trigger
language plpgsql
set search_path = public
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

  if v_count = 0 then return null; end if;

  select amount into v_amount from transactions where id = v_transaction_id;
  if v_amount is null then return null; end if;

  if v_sum <> v_amount then
    raise exception 'transaction_shares for transaction % sum to % but the transaction amount is %',
      v_transaction_id, v_sum, v_amount;
  end if;
  return null;
end;
$$;

create or replace function transaction_shares_guard_settled()
returns trigger
language plpgsql
set search_path = public
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
