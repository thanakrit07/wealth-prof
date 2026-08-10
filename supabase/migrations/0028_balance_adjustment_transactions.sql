-- A balance correction becomes a Transaction instead of moving an anchor
-- (superseding most of 0027's account_anchors write path — see the ADR).
-- Reconciling now asks "is this really income/an expense?": answering yes
-- files it under the household's existing "Other" category, so it reads
-- like any other transaction; answering no files it under a new
-- household-scoped "Modified Bal" category that exists to be excluded --
-- from the category picker, from Records, and from every rollup -- while
-- still being a real row the household can find on the account's own
-- screen. Both answers are tagged `source = 'reconcile'` for that lookup,
-- regardless of which category they land in.

alter table categories add column system boolean not null default false;

alter type transaction_source add value 'reconcile';

create or replace function seed_default_categories(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense text[][] := array[
    array['Installments', 'installments'], array['Insurance', 'insurance'],
    array['Food', 'food'], array['Transport', 'transport'],
    array['Shopping', 'shopping'], array['Phone/Internet', 'phone'],
    array['Entertainment', 'entertainment'], array['Health', 'health'],
    array['Education', 'education'], array['Housing', 'housing'],
    array['Travel', 'travel'], array['Other', 'other']
  ];
  v_income text[][] := array[
    array['Salary', 'salary'], array['Side income', 'wallet'],
    array['Bonus', 'bonus'], array['Other', 'other']
  ];
  v_row text[];
  v_sort int;
begin
  v_sort := 0;
  foreach v_row slice 1 in array v_expense loop
    insert into categories (household_id, name, kind, icon, sort_order)
    values (p_household_id, v_row[1], 'expense', v_row[2], v_sort);
    v_sort := v_sort + 1;
  end loop;

  v_sort := 0;
  foreach v_row slice 1 in array v_income loop
    insert into categories (household_id, name, kind, icon, sort_order)
    values (p_household_id, v_row[1], 'income', v_row[2], v_sort);
    v_sort := v_sort + 1;
  end loop;

  -- Reconcile's "no" answer needs a category in each kind — a positive
  -- Drift is income-shaped, a negative one is expense-shaped, and both
  -- share the same DB rule every other income/expense row follows
  -- (category_kind_matches). sort_order is last and irrelevant: `system`
  -- is what keeps these out of the picker grid, not their position in it.
  insert into categories (household_id, name, kind, icon, sort_order, system)
  values
    (p_household_id, 'Modified Bal', 'expense', 'repair', v_sort, true),
    (p_household_id, 'Modified Bal', 'income', 'repair', v_sort, true);
end;
$$;

-- Backfill every existing household with the one category set they're
-- missing -- `seed_default_categories` is additive (no delete-then-insert),
-- so re-running it for a household that already has categories would
-- duplicate all of them, not just add "Modified Bal". Insert directly instead.
do $$
declare
  v_household record;
begin
  for v_household in select id from households loop
    insert into categories (household_id, name, kind, icon, sort_order, system)
    values
      (v_household.id, 'Modified Bal', 'expense', 'repair',
       (select coalesce(max(sort_order), -1) + 1 from categories where household_id = v_household.id and kind = 'expense'), true),
      (v_household.id, 'Modified Bal', 'income', 'repair',
       (select coalesce(max(sort_order), -1) + 1 from categories where household_id = v_household.id and kind = 'income'), true);
  end loop;
end;
$$;

-- 0019 gave this view an explicit column list (not `select *`), so a new
-- column is invisible to the app until added here too.
create or replace view v_categories with (security_invoker = true) as
  select id, household_id, name, kind, icon, sort_order, archived, parent_id, color, system
  from categories;
