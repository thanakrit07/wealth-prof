-- Extends create_household (0009) to seed the default category set from
-- SPEC.md §5 in the same transaction, so a brand-new household is usable
-- immediately without a separate seeding step.
--
-- Superseded by 0011_category_icons.sql, which redefines create_household
-- again to add icon keys and extracts seeding into its own function. Kept
-- verbatim here so the migration history matches what actually ran.
create or replace function create_household(p_display_name text)
returns household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_member household_members;
  v_expense_categories text[] := array[
    'Installments', 'Insurance', 'Food', 'Transport', 'Shopping',
    'Phone/Internet', 'Entertainment', 'Health', 'Education', 'Housing',
    'Travel', 'Other'
  ];
  v_income_categories text[] := array['Salary', 'Side income', 'Bonus', 'Other'];
  v_name text;
  v_sort int;
begin
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  insert into households default values returning id into v_household_id;

  insert into household_members (household_id, user_id, display_name)
  values (v_household_id, auth.uid(), p_display_name)
  returning * into v_member;

  v_sort := 0;
  foreach v_name in array v_expense_categories loop
    insert into categories (household_id, name, kind, sort_order)
    values (v_household_id, v_name, 'expense', v_sort);
    v_sort := v_sort + 1;
  end loop;

  v_sort := 0;
  foreach v_name in array v_income_categories loop
    insert into categories (household_id, name, kind, sort_order)
    values (v_household_id, v_name, 'income', v_sort);
    v_sort := v_sort + 1;
  end loop;

  return v_member;
end;
$$;
