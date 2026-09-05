-- Named subdivisions within a project, rendered as Kanban board columns.
-- A section always belongs to exactly one project (cascade-deleted with
-- it); a task's section membership is optional and independent of nothing
-- else -- it's just an additional grouping on top of project_id.
create table sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table sections enable row level security;

create policy "sections_owner_all" on sections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index sections_user_project_idx on sections (user_id, project_id);

alter table tasks add column section_id uuid references sections(id) on delete set null;
create index tasks_user_section_idx on tasks (user_id, section_id);
