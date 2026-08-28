-- Self-referencing: a recurring event's own id is written into its own
-- series_id, so "every occurrence of this series" is always a uniform
-- `where series_id = X` query, master included -- no OR-branching between
-- "is the master" and "is a later occurrence." on delete set null (not
-- cascade): deleting the master stops future occurrences from being
-- generated without deleting materialized ones that already happened.
alter table events add column series_id uuid references events(id) on delete set null;

create index events_series_idx on events (series_id) where series_id is not null;
