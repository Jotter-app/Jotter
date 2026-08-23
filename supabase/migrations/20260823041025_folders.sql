-- Nested folder tree for notes (Obsidian-style file explorer, arbitrary depth
-- via self-referencing parent_folder_id).
create table folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_folder_id uuid references folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table folders enable row level security;

create policy "folders_owner_all" on folders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index folders_user_parent_idx on folders (user_id, parent_folder_id);
