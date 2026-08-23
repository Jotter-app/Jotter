-- Tasks/reminders (TickTick-style quick-add). recurrence_rule and
-- parent_task_id are unused by MVP app code but included now per the design
-- spec so Phase 2 (recurrence, subtasks) doesn't need a schema migration.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  due_at timestamptz,
  priority smallint not null default 0,
  recurrence_rule text,
  parent_task_id uuid references tasks(id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "tasks_owner_all" on tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index tasks_user_due_idx on tasks (user_id, due_at);
create index tasks_user_completed_idx on tasks (user_id, completed_at);
