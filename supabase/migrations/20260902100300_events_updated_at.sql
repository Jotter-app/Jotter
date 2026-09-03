-- Calendar sync's conflict resolution (resolveConflict) compares this
-- app's own last-edit timestamp against Google's `updated` timestamp to
-- decide which side wins -- events never got this column when the table
-- was created (same gap tasks had before Phase H's add_tasks_updated_at
-- migration; same fix, same moddatetime trigger pattern).
alter table events add column updated_at timestamptz not null default now();

create trigger events_set_updated_at
  before update on events
  for each row
  execute function moddatetime(updated_at);
