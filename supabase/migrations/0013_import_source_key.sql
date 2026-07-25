-- DESIGN.md §9: re-running the sheet import must update matching rows and
-- insert new ones, never wipe. source_key = "<sheet tab>:<row identity>",
-- unique per household so a second import run resolves via upsert.
alter table accounts add column source_key text;
alter table cards add column source_key text;
alter table installments add column source_key text;
alter table transactions add column source_key text;

create unique index accounts_source_key_idx on accounts (household_id, source_key) where source_key is not null;
create unique index cards_source_key_idx on cards (household_id, source_key) where source_key is not null;
create unique index installments_source_key_idx on installments (household_id, source_key) where source_key is not null;
create unique index transactions_source_key_idx on transactions (household_id, source_key) where source_key is not null;
