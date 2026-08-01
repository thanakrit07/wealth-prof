-- 0013 used a partial unique index (where source_key is not null), but
-- Postgres can't use a partial index for ON CONFLICT (columns) inference
-- unless the same predicate is repeated in the conflict clause, which
-- Supabase's .upsert(onConflict: '...') does not do. A plain unique
-- constraint already allows multiple NULL source_key rows (NULLs are
-- never equal to each other), so it gives the same guarantee and works
-- with upsert's conflict inference.
drop index if exists accounts_source_key_idx;
drop index if exists cards_source_key_idx;
drop index if exists installments_source_key_idx;
drop index if exists transactions_source_key_idx;

alter table accounts add constraint accounts_source_key_key unique (household_id, source_key);
alter table cards add constraint cards_source_key_key unique (household_id, source_key);
alter table installments add constraint installments_source_key_key unique (household_id, source_key);
alter table transactions add constraint transactions_source_key_key unique (household_id, source_key);
