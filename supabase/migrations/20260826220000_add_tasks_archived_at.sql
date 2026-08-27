-- Lets the Completed section be cleared without permanently losing data --
-- archived_at follows the exact same nullable-timestamp-as-flag shape as
-- completed_at. No CHECK constraint enforcing "archived implies completed":
-- that invariant is enforced app-side (matches completed_at itself having
-- no DB-level constraints), and no new index -- personal-scale data.
alter table tasks add column archived_at timestamptz;
