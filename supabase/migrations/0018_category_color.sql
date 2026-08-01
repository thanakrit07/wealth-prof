-- Optional per-category icon colour. Null keeps the current neutral
-- (muted-foreground) rendering, so every existing row is unaffected and the
-- column needs no backfill. Stored as a plain hex string rather than a
-- palette index so the palette can change without rewriting data.
alter table categories add column color text;
