-- current_household_id() must stay executable by `authenticated` (every RLS
-- policy calls it), but anon has no legitimate reason to call it directly via
-- the RPC endpoint (flagged by the security advisor).
revoke execute on function current_household_id() from public;
revoke execute on function current_household_id() from anon;
grant execute on function current_household_id() to authenticated;
