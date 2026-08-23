-- Reminders are split out from tasks/events so the cron job's query stays
-- simple regardless of which parent type it belongs to, and so a task/event
-- could later have multiple reminder times without changing this table.
--
-- user_id is denormalized for the same reason as taggables: the cron job's
-- core query (fire_at <= now() and sent_at is null) shouldn't need a join
-- into tasks/events just to know ownership.
--
-- last_error supports the spec's "log failures for later cleanup of stale
-- push subscriptions" requirement without a separate log table.
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  fire_at timestamptz not null,
  channel text not null check (channel in ('push', 'email')),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint reminders_exactly_one_parent check (
    (task_id is not null and event_id is null) or
    (task_id is null and event_id is not null)
  )
);

alter table reminders enable row level security;

create policy "reminders_owner_all" on reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Partial index matches the cron job's exact query shape.
create index reminders_due_unsent_idx on reminders (fire_at) where sent_at is null;
