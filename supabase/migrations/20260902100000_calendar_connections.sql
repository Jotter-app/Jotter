-- One row per user's connected external calendar account. v1 supports a
-- single provider (Google) and a single calendar (the account's primary) --
-- the unique(user_id, provider) constraint enforces "one connection per
-- provider per user" at the schema level rather than in application code.
create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  google_calendar_id text not null default 'primary',
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz not null,
  -- Google's incremental-sync cursor. Null means "no successful sync yet
  -- (or Google invalidated the old one with a 410)" -- the pull job falls
  -- back to a bounded full resync whenever this is null.
  sync_token text,
  status text not null default 'active',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint calendar_connections_status_check check (status in ('active', 'error', 'disconnected')),
  constraint calendar_connections_one_per_provider unique (user_id, provider)
);

alter table calendar_connections enable row level security;

create policy "calendar_connections_owner_all" on calendar_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
