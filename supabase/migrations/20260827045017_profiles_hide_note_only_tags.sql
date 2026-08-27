-- Default true: a tag not attached to any task is hidden from the Tasks
-- page's tag filter row and per-task tag picker until it's actually
-- assigned to a task. Existing rows backfill to true along with new ones
-- (the auto-provisioning trigger in the profiles migration applies this
-- column's default the same way it applies default_event_creates_task's).
alter table profiles
  add column hide_note_only_tags_from_tasks boolean not null default true;
