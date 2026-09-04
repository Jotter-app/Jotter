-- Flat, top-level organizational layer above tasks -- deliberately not
-- nested like folders (see the design spec's Non-Goals): every project
-- sits at the same level, just a name and its tasks.
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table projects enable row level security;

create policy "projects_owner_all" on projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- on delete set null (not cascade): deleting a project's row never
-- destroys its tasks by itself -- they simply become unfiled. The
-- separate "delete tasks too" choice (ProjectDeleteDialog) is an explicit,
-- additional step, not something the schema does implicitly.
alter table tasks add column project_id uuid references projects(id) on delete set null;
create index tasks_user_project_idx on tasks (user_id, project_id);
