-- Household: the sharing unit. In practice there is exactly one row,
-- but modelling it properly keeps RLS simple and uniform.
create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our household',
  created_at  timestamptz not null default now()
);

-- Members: links Supabase auth.users to a household.
create table household_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid unique references auth.users(id),  -- null until the invite is accepted
  display_name  text not null,
  color         text not null default '#3b82f6',        -- the person's colour across the whole UI
  invite_code   text unique,
  created_at    timestamptz not null default now()
);
