-- `note` becomes the primary user-facing label shown in the ledger;
-- `description` becomes the secondary "+ Add details" field.
--
-- Postgres evaluates every SET expression against the pre-update row, so
-- this single statement is a genuine swap and needs no scratch column.
--
-- Guarded by a column comment, not by inspecting data: after the swap the
-- data cannot tell you which way round it is, so a re-run would silently
-- swap the columns back.
do $$
declare
  marker text;
begin
  select col_description('public.transactions'::regclass, attnum) into marker
    from pg_attribute
   where attrelid = 'public.transactions'::regclass
     and attname = 'note' and not attisdropped;

  if marker like '%swapped-0020%' then
    raise notice '0020 already applied - skipping';
    return;
  end if;

  -- No WHERE clause: soft-deleted rows are swapped too, so undeleting one
  -- later does not resurrect a row labelled the old way.
  update public.transactions
     set note        = nullif(description, ''),  -- '' -> NULL so an empty
                                                  -- label lets the category
                                                  -- fallback fire
         description = coalesce(note, '');       -- description is NOT NULL

  comment on column public.transactions.note is
    'Primary user-facing label, shown as the ledger row title. Nullable; UI falls back to category name. (swapped-0020)';
  comment on column public.transactions.description is
    'Secondary free-text detail, entered behind "+ Add details". NOT NULL, defaults to ''''. (swapped-0020)';
end $$;
