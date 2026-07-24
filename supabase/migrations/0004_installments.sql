create type installment_status as enum ('active', 'done', 'cancelled');

create table installments (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  name            text not null,
  category_id     uuid references categories(id),
  start_date      date not null,                     -- period 1 falls in the cycle containing this date
  total_periods   int not null check (total_periods > 0),
  monthly_amount  numeric(14,2) not null,
  final_amount    numeric(14,2),                     -- last period often differs (rounding); null = same
  card_id         uuid references cards(id),
  account_id      uuid references accounts(id),
  annual_interest_rate numeric(6,3) not null default 0,  -- % per year, normalised (§6.4)
  is_cash_advance boolean not null default false,
  owner_id        uuid references household_members(id),
  note            text,
  status          installment_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references household_members(id),
  deleted_at      timestamptz,
  constraint one_instrument check (num_nonnulls(card_id, account_id) = 1)
);

-- D2: each period payment is an event, not a counter.
create table installment_payments (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,  -- denormalised for RLS (§4.7)
  installment_id  uuid not null references installments(id) on delete cascade,
  period_no       int not null check (period_no > 0),
  paid_date       date not null default current_date,
  transaction_id  uuid unique references transactions(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (installment_id, period_no)
);
-- periods paid = count(*); outstanding = see §6.2
