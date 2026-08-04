-- Imported recurring rules need the same stable, household-scoped identity as
-- the other import targets so a re-run updates a rule instead of duplicating it.
alter table recurring_rules add column source_key text;

alter table recurring_rules
  add constraint recurring_rules_source_key_key unique (household_id, source_key);
