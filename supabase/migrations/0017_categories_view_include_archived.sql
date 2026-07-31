-- v_categories filtered out archived rows unconditionally (0007), which
-- meant an archived category vanished from every consumer of
-- useCategories() — including HomeScreen/CardCycleDialog/TransactionsScreen,
-- which use it purely to look up an existing transaction's category name and
-- icon, not to build a picker. A transaction filed under an archived
-- category would render with no icon/name, and the Settings archive toggle
-- had no way to be un-toggled since the archived row was invisible there
-- too. Every picker consumer already does its own `.filter(c => !c.archived)`
-- (TransactionSheet, InstallmentSheet, RecurringRuleSheet, CategoriesScreen's
-- own list), so the view-level filter was both redundant and harmful.
create or replace view v_categories with (security_invoker = true) as
  select * from categories;
