-- One row per user, auto-provisioned on signup. Currently holds a single
-- preference (whether creating a calendar event also creates a linked
-- task by default) for the Jotter feature -- kept as its own table rather
-- than a column on auth.users since app code can't alter that table.
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_event_creates_task boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_owner_all" on profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-create a profile row for every new signup so app code can generally
-- assume one exists. Accounts that signed up before this migration get no
-- backfill row here -- every read falls back to the column default instead
-- (see lib/actions/settings.ts), and the settings write path upserts, so
-- such an account gets a row on its first write.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
