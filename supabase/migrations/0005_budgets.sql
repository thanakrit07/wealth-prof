create table budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  category_id   uuid not null references categories(id),
  amount        numeric(14,2) not null,
  month         date,          -- null = the default for every month; set = override for that month
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- NULLS NOT DISTINCT is required: without it Postgres treats every null month
  -- as unique and allows duplicate defaults for the same category.
  unique nulls not distinct (household_id, category_id, month)
);
