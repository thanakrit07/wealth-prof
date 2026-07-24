-- Adds icon keys to the seeded default categories (matches src/lib/categoryIcons.tsx)
-- and backfills any household created before this seeding existed.
create or replace function create_household(p_display_name text)
returns household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_member household_members;
begin
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  insert into households default values returning id into v_household_id;

  insert into household_members (household_id, user_id, display_name)
  values (v_household_id, auth.uid(), p_display_name)
  returning * into v_member;

  perform seed_default_categories(v_household_id);

  return v_member;
end;
$$;

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
end;
$$;

revoke execute on function seed_default_categories(uuid) from public, anon, authenticated;

-- Backfill households that predate default-category seeding.
do $$
declare
  v_household record;
begin
  for v_household in
    select h.id from households h
    where not exists (select 1 from categories c where c.household_id = h.id)
  loop
    perform seed_default_categories(v_household.id);
  end loop;
end;
$$;
