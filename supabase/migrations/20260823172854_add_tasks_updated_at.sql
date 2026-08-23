-- Phase H: task edits need the same optimistic-concurrency check notes
-- already have (compare the client's loaded updated_at against the
-- current row before writing), which requires tracking it in the first
-- place -- tasks never got this column when the table was created.
alter table tasks add column updated_at timestamptz not null default now();

create trigger tasks_set_updated_at
  before update on tasks
  for each row
  execute function moddatetime(updated_at);
