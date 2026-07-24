-- recurring_rules and transactions reference each other, so both tables are
-- created first and the transactions -> recurring_rules foreign key is added
-- afterwards with alter table (see DESIGN.md §4.4).

create type recurrence_freq as enum ('weekly', 'monthly', 'yearly');
create type month_end_rule as enum ('clamp', 'skip');   -- 31st in a 30-day month
create type transaction_kind as enum ('income', 'expense', 'transfer');
create type transaction_source as enum ('manual', 'recurring', 'installment', 'import');

create table recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,                          -- "Salary", "Car insurance", "Netflix"

  -- Transaction template
  kind          transaction_kind not null,
  category_id   uuid references categories(id),
  category_kind category_kind,
  amount        numeric(14,2) not null check (amount > 0),
  owner_id      uuid references household_members(id),
  from_account_id uuid references accounts(id),
  from_card_id    uuid references cards(id),
  to_account_id   uuid references accounts(id),
  to_card_id      uuid references cards(id),
  note          text,

  -- Schedule
  freq          recurrence_freq not null,
  interval      int not null default 1 check (interval > 0),  -- every N periods
  day_of_month  int check (day_of_month between 1 and 31),    -- monthly / yearly
  month_of_year int check (month_of_year between 1 and 12),   -- yearly
  weekday       int check (weekday between 0 and 6),          -- weekly (0 = Sunday)
  month_end     month_end_rule not null default 'clamp',
  start_date    date not null,
  end_date      date,                                         -- null = open ended
  max_occurrences int,                                        -- optional alternative to end_date

  -- Behaviour
  auto_post     boolean not null default false,  -- true: post confirmed; false: post unconfirmed for review
  variable_amount boolean not null default false,-- amount changes monthly (utilities) -> always review
  active        boolean not null default true,
  last_generated_date date,                      -- watermark; generation resumes from here
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references household_members(id),
  deleted_at    timestamptz,

  constraint one_source check (num_nonnulls(from_account_id, from_card_id) = 1),
  constraint dest_iff_transfer check (
    case when kind = 'transfer'
         then num_nonnulls(to_account_id, to_card_id) = 1
         else num_nonnulls(to_account_id, to_card_id) = 0 end
  ),
  constraint category_iff_not_transfer check ((kind = 'transfer') = (category_id is null)),
  foreign key (category_id, category_kind) references categories(id, kind),
  constraint schedule_fields check (
    case freq
      when 'weekly'  then weekday is not null
      when 'monthly' then day_of_month is not null
      when 'yearly'  then day_of_month is not null and month_of_year is not null
    end
  )
);

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  date          date not null,                        -- plain date, always read as Asia/Bangkok
  kind          transaction_kind not null,
  category_id   uuid references categories(id),       -- required for income/expense, null for transfer
  category_kind category_kind,                        -- denormalised for fast queries; kept honest by the FK below
  description   text not null default '',
  amount        numeric(14,2) not null check (amount > 0),
  owner_id      uuid references household_members(id),

  -- Where the money comes from, and (for transfers) where it goes.
  from_account_id uuid references accounts(id),
  from_card_id    uuid references cards(id),
  to_account_id   uuid references accounts(id),
  to_card_id      uuid references cards(id),

  note          text,
  source        transaction_source not null default 'manual',
  recurring_rule_id uuid,                              -- FK added below via alter table
  occurrence_date   date,                             -- the scheduled date this instance came from
  confirmed     boolean not null default true,        -- false = generated, awaiting review (§6.6)
  created_by    uuid references household_members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references household_members(id),
  deleted_at    timestamptz,

  -- Exactly one source instrument, and a destination only for transfers.
  constraint one_source check (num_nonnulls(from_account_id, from_card_id) = 1),
  constraint dest_iff_transfer check (
    case when kind = 'transfer'
         then num_nonnulls(to_account_id, to_card_id) = 1
         else num_nonnulls(to_account_id, to_card_id) = 0 end
  ),
  -- Categories apply to income/expense only, and the denormalised kind must match.
  constraint category_iff_not_transfer check (
    (kind = 'transfer') = (category_id is null)
  ),
  constraint category_kind_matches check (
    (kind = 'transfer' and category_kind is null) or category_kind::text = kind::text
  ),
  foreign key (category_id, category_kind) references categories(id, kind),
  -- Idempotent materialisation of recurring instances (§6.6).
  unique (recurring_rule_id, occurrence_date)
);

alter table transactions
  add constraint transactions_recurring_rule_id_fkey
  foreign key (recurring_rule_id) references recurring_rules(id) on delete set null;

create index on transactions (household_id, date desc) where deleted_at is null;
create index on transactions (household_id, from_card_id, date) where deleted_at is null;
