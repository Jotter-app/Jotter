-- Shared tag vocabulary across notes and tasks (see taggables migration).
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table tags enable row level security;

create policy "tags_owner_all" on tags
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
