-- Bootstraps a brand-new user's household (DESIGN.md §5, first-run flow).
-- A plain client-side insert cannot do this: the households RLS policy
-- requires id = current_household_id(), which is null until a
-- household_members row exists — a chicken-and-egg problem for the very
-- first insert. SECURITY DEFINER bypasses RLS for this one controlled path.
create function create_household(p_display_name text)
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

  return v_member;
end;
$$;

revoke execute on function create_household(text) from public;
revoke execute on function create_household(text) from anon;
grant execute on function create_household(text) to authenticated;
