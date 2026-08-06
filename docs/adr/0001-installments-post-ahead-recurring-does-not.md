# Installment Periods are posted ahead of time; Recurring Occurrences are not

An Installment Plan is a contract: its Periods are certain in count, date and
amount the moment the plan starts, so all of them — including the ones still in
the future — are written into the ledger immediately. A Recurring Rule is only
an expectation: it has no committed end, its amount often varies, and it can be
stopped at any time, so its future Occurrences are never written and are
projected in memory instead.

## Considered Options

Making the two symmetric was considered in both directions and rejected:

- **Both post ahead.** Editing or stopping a rule would mean hunting down and
  deleting rows that were never certain in the first place — exactly the cleanup
  problem §6.6 was written to avoid.
- **Both project.** Installment Periods would disappear from the months they
  actually land in, which is the drift D11 was written to kill.

## Consequences

The two posting engines look inconsistent to anyone reading the code, and the
inconsistency is the point — it tracks a real difference between a debt you have
already incurred and a habit you might drop next month. Screens that look at
future months must merge both sources, posted rows plus projected Occurrences,
rather than reading the ledger alone.
