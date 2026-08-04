-- Read models for member debts (0022). Every screen reads these, and they all
-- resolve the same two questions the same way:
--   who fronted the money  = the owner of the paying card/account
--   who still owes it back = a share not yet repaid by a live transfer

create view v_transaction_shares with (security_invoker = true) as
  select ts.*
  from transaction_shares ts
  join transactions t on t.id = ts.transaction_id
  where t.deleted_at is null;

-- One row per debt between two people, settled or not, carrying enough of the
-- transaction to list and pick items in the UI without a second round trip.
--
-- `kind = 'expense'` is a correctness rule, not a filter: on income the money
-- lands *in* the instrument owner's account (§6.3), so the non-owner would be
-- the creditor and the direction silently inverts. Shares on shared income are
-- still written -- the per-person split needs them -- they just are not debts.
create view v_share_debts with (security_invoker = true) as
  select
    ts.id,
    ts.household_id,
    ts.transaction_id,
    ts.settled_by_transaction_id,
    ts.member_id                     as owes_member_id,
    coalesce(c.owner_id, a.owner_id) as owed_member_id,
    ts.share_amount                  as amount,
    -- Two ways to end up owing: your part of something shared, or something
    -- of yours put on their card.
    case when t.owner_id is null then 'split' else 'borrow' end as debt_kind,
    t.date,
    t.amount                         as transaction_amount,
    t.note,
    t.description,
    t.category_id
  from transaction_shares ts
  join transactions t on t.id = ts.transaction_id and t.deleted_at is null
  left join cards c on c.id = t.from_card_id
  left join accounts a on a.id = t.from_account_id
  where t.kind = 'expense'
    and not t.debt_exempt
    and coalesce(c.owner_id, a.owner_id) is not null
    and ts.member_id <> coalesce(c.owner_id, a.owner_id);

-- Outstanding debts. Settled-ness is decided here rather than by the column
-- being non-null, so undoing a repayment -- which soft-deletes the transfer --
-- releases everything it covered without touching a single share row.
create view v_unsettled_shares with (security_invoker = true) as
  select d.*
  from v_share_debts d
  left join transactions st
    on st.id = d.settled_by_transaction_id and st.deleted_at is null
  where st.id is null;

-- Deliberately no "balance per pair" aggregate. The screen showing "X owes Y
-- ฿nnn" also shows the items behind it, and reading the headline from an
-- aggregate while reading the list from rows is how the two came to disagree:
-- the headline netted both directions, the list showed one. Both read
-- v_unsettled_shares.

-- The repayment log: transfers that cleared something. There is no settlements
-- table -- the transfer *is* the record, so it appears in the ledger like any
-- other movement of money and can be audited there.
--
-- `amount` is the cash that actually moved and `net_cleared` is what the linked
-- debts came to; they agree when the app wrote them together and diverge only
-- if the transfer is edited afterwards, which the UI surfaces rather than
-- papering over.
create view v_settlements with (security_invoker = true) as
  select
    st.id,
    st.household_id,
    st.date                            as settled_on,
    st.note,
    st.created_at,
    st.created_by,
    coalesce(fc.owner_id, fa.owner_id) as from_member_id,
    coalesce(tc.owner_id, ta.owner_id) as to_member_id,
    st.amount                          as amount,
    coalesce(sum(d.amount), 0)         as gross_amount,
    coalesce(sum(case when d.owes_member_id = coalesce(fc.owner_id, fa.owner_id)
                      then d.amount else -d.amount end), 0) as net_cleared,
    count(d.id)                        as share_count
  from transactions st
  left join cards    fc on fc.id = st.from_card_id
  left join accounts fa on fa.id = st.from_account_id
  left join cards    tc on tc.id = st.to_card_id
  left join accounts ta on ta.id = st.to_account_id
  join v_share_debts d on d.settled_by_transaction_id = st.id
  where st.kind = 'transfer' and st.deleted_at is null
  group by st.id, st.household_id, st.date, st.note, st.created_at, st.created_by,
           st.amount, fc.owner_id, fa.owner_id, tc.owner_id, ta.owner_id;
