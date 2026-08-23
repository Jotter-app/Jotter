-- Calendar events. Kept separate from tasks: events are time-ranges on a
-- calendar, tasks are due-points that may or may not appear on it.
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  calendar_color text not null default '#3b82f6',
  recurrence_rule text,
  created_at timestamptz not null default now(),
  constraint events_end_after_start check (end_at >= start_at)
);

alter table events enable row level security;

create policy "events_owner_all" on events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index events_user_range_idx on events (user_id, start_at, end_at);
