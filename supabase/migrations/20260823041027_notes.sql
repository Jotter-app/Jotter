-- Notes live inside the folder tree. folder_id is nullable + ON DELETE SET NULL
-- so a note never gets destroyed as a side effect of a folder-tree operation;
-- the app layer handles the "delete contents vs. move to parent" choice
-- explicitly (see design spec's folder-deletion error-handling requirement).
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  title text not null default '',
  body_markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notes enable row level security;

create policy "notes_owner_all" on notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger notes_set_updated_at
  before update on notes
  for each row
  execute function moddatetime(updated_at);

create index notes_user_folder_idx on notes (user_id, folder_id);
