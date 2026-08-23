-- Phase 2 tables (wikilinks/backlinks, attach-note-to-task), created now
-- because they're trivial and this avoids a schema migration later. Not
-- written to by any MVP app code.
create table note_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_note_id uuid not null references notes(id) on delete cascade,
  target_note_id uuid not null references notes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_note_id, target_note_id)
);

alter table note_links enable row level security;

create policy "note_links_owner_all" on note_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table task_note_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  note_id uuid not null references notes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, note_id)
);

alter table task_note_links enable row level security;

create policy "task_note_links_owner_all" on task_note_links
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
