-- Ownership convention for every record type below:
--   owner_id = a member id, or null meaning "shared".
-- (A nullable FK rather than a person1/person2 enum, so names and the
--  number of people stay flexible.)

create type account_type as enum ('bank', 'cash', 'ewallet');

create table accounts (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  name           text not null,
  type           account_type not null default 'bank',
  owner_id       uuid references household_members(id),
  anchor_balance numeric(14,2) not null default 0,   -- balance as of anchor_date (see D4)
  anchor_date    date not null default current_date,
  sort_order     int not null default 0,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references household_members(id),
  deleted_at     timestamptz                          -- soft delete (principle 4)
);

create table cards (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  name           text not null,
  credit_limit   numeric(14,2) not null,
  statement_day  int not null check (statement_day between 1 and 31),
  due_day        int not null check (due_day between 1 and 31),
  annual_interest_rate numeric(6,3) not null default 0,  -- % per year, always (see §6.4)
  owner_id       uuid references household_members(id),
  sort_order     int not null default 0,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references household_members(id),
  deleted_at     timestamptz
);

-- D3: statement reconciliation is per billing cycle, not a single field on the card.
create table card_cycle_adjustments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  card_id       uuid not null references cards(id) on delete cascade,
  cycle_start   date not null,                        -- identifies the cycle (see §6.1)
  amount        numeric(14,2) not null,               -- signed delta vs. the computed total
  note          text,
  created_at    timestamptz not null default now(),
  unique (card_id, cycle_start)
);

create type category_kind as enum ('income', 'expense');

create table categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  kind          category_kind not null,
  icon          text,
  sort_order    int not null default 0,
  archived      boolean not null default false,
  unique (id, kind)                                   -- supports the composite FK below
);
