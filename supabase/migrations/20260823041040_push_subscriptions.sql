-- Addition beyond the design spec's explicit table list: Web Push requires
-- persisting a per-device subscription (endpoint + keys) somewhere for the
-- reminder cron job to send to. One user can have multiple subscriptions
-- (one per browser/device).
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_owner_all" on push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
