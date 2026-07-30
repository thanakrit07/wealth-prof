-- Pins search_path on the two trigger functions added in 0015, matching the
-- convention already used by create_household/seed_default_categories
-- (0011) — an unset search_path lets a role-level search_path override
-- which `categories`/enum the function resolves, which is exactly the kind
-- of surprise a SECURITY DEFINER-adjacent function should never have.
create or replace function categories_enforce_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_kind category_kind;
  v_parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A category cannot be its own parent';
  end if;

  select kind, parent_id into v_parent_kind, v_parent_parent_id
  from categories where id = new.parent_id;

  if not found then
    raise exception 'parent_id % does not exist', new.parent_id;
  end if;

  if v_parent_parent_id is not null then
    raise exception 'Sub-categories cannot themselves have sub-categories (max depth 1)';
  end if;

  if v_parent_kind is distinct from new.kind then
    raise exception 'A sub-category must share its parent''s kind';
  end if;

  return new;
end;
$$;

create or replace function categories_cascade_archive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.archived and not old.archived and new.parent_id is null then
    update categories set archived = true
    where parent_id = new.id and archived is false;
  end if;
  return new;
end;
$$;
