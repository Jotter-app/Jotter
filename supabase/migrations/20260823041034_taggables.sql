-- Polymorphic join table letting both notes and tasks share the same tag
-- vocabulary. taggable_id intentionally has no FK (it points at either
-- notes.id or tasks.id depending on taggable_type) -- app code is
-- responsible for referential integrity here.
--
-- user_id is denormalized (not derivable via a single join from taggable_id
-- alone, since the target table is polymorphic) so RLS stays a cheap
-- `auth.uid() = user_id` check instead of a cross-table EXISTS subquery.
create table taggables (
  tag_id uuid not null references tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  taggable_id uuid not null,
  taggable_type text not null check (taggable_type in ('note', 'task')),
  created_at timestamptz not null default now(),
  primary key (tag_id, taggable_id, taggable_type)
);

alter table taggables enable row level security;

create policy "taggables_owner_all" on taggables
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index taggables_lookup_idx on taggables (user_id, taggable_type, taggable_id);
