-- Helper: the current user's household. SECURITY DEFINER so it can read
-- household_members without recursing into that table's own policy.
create function current_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members where user_id = auth.uid()
$$;

-- household_members must NOT use the helper, or the policy recurses into itself.
alter table household_members enable row level security;
create policy self_row on household_members
  for select using (user_id = auth.uid());
create policy same_household on household_members
  for select using (household_id = current_household_id());
create policy self_update on household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table households enable row level security;
create policy own_household on households
  for all using (id = current_household_id())
  with check (id = current_household_id());

-- Every other table, same shape.
alter table accounts enable row level security;
create policy member_all on accounts
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table cards enable row level security;
create policy member_all on cards
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table card_cycle_adjustments enable row level security;
create policy member_all on card_cycle_adjustments
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table categories enable row level security;
create policy member_all on categories
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table transactions enable row level security;
create policy member_all on transactions
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table recurring_rules enable row level security;
create policy member_all on recurring_rules
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table installments enable row level security;
create policy member_all on installments
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table installment_payments enable row level security;
create policy member_all on installment_payments
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());

alter table budgets enable row level security;
create policy member_all on budgets
  for all using (household_id = current_household_id())
  with check (household_id = current_household_id());
