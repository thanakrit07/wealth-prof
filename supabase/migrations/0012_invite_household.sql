-- Invite flow (DESIGN.md §5): generate_invite_code creates a placeholder
-- household_members row (user_id null) with a short unique code;
-- join_household lets a brand-new signed-up user claim that row instead of
-- creating their own household. Both are SECURITY DEFINER for the same
-- reason as create_household — household_members has no INSERT policy for
-- ordinary users, only the same_household/self_row SELECT policies and a
-- self_update UPDATE policy, none of which allow inserting or claiming a
-- row on someone else's behalf.

create or replace function generate_invite_code(p_display_name text)
returns household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_code text;
  v_member household_members;
begin
  select household_id into v_household_id from household_members where user_id = auth.uid();
  if v_household_id is null then
    raise exception 'You must belong to a household first';
  end if;

  v_code := encode(extensions.gen_random_bytes(5), 'hex');

  insert into household_members (household_id, display_name, invite_code)
  values (v_household_id, p_display_name, v_code)
  returning * into v_member;

  return v_member;
end;
$$;

create or replace function join_household(p_invite_code text, p_display_name text)
returns household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member household_members;
begin
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  update household_members
  set user_id = auth.uid(),
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      invite_code = null
  where invite_code = p_invite_code and user_id is null
  returning * into v_member;

  if v_member.id is null then
    raise exception 'Invalid or already-used invite code';
  end if;

  return v_member;
end;
$$;

create or replace function revoke_invite(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from household_members
  where id = p_member_id
    and user_id is null
    and household_id = (select household_id from household_members where user_id = auth.uid());
end;
$$;

revoke execute on function generate_invite_code(text) from public, anon;
revoke execute on function join_household(text, text) from public, anon;
revoke execute on function revoke_invite(uuid) from public, anon;
grant execute on function generate_invite_code(text) to authenticated;
grant execute on function join_household(text, text) to authenticated;
grant execute on function revoke_invite(uuid) to authenticated;
