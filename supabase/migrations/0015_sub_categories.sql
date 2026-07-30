-- D10 (DESIGN.md v3): two-level categories. parent_id null = a main
-- category; set = a sub-category. Depth is capped at 1 (a sub's parent
-- must itself be a main) and a sub always shares its parent's kind — both
-- enforced by trigger, since a plain check constraint cannot look at the
-- parent row.

alter table categories add column parent_id uuid references categories(id);
create index idx_categories_parent_id on categories(parent_id);

create or replace function categories_enforce_hierarchy()
returns trigger
language plpgsql
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

create trigger trg_categories_enforce_hierarchy
before insert or update of parent_id, kind on categories
for each row execute function categories_enforce_hierarchy();

-- Archiving a main archives its subs too — an archived main with visible
-- subs would be a dead end in the picker (DESIGN.md §4.2).
create or replace function categories_cascade_archive()
returns trigger
language plpgsql
as $$
begin
  if new.archived and not old.archived and new.parent_id is null then
    update categories set archived = true
    where parent_id = new.id and archived is false;
  end if;
  return new;
end;
$$;

create trigger trg_categories_cascade_archive
after update of archived on categories
for each row execute function categories_cascade_archive();
