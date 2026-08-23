-- Extensions needed across later migrations.
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "moddatetime"; -- updated_at triggers
