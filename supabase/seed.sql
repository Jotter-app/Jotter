-- Local-development-only seed data. Never applied to the hosted project
-- (supabase db reset only runs this against the local Docker stack).
--
-- Creates one demo user (via Supabase's auth schema directly, since this
-- runs before any app code exists) plus a small folder/note/task/tag set
-- for manual testing during development.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'demo@example.com',
  crypt('demo-password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}'
);

-- Folder tree: Work > Meeting Notes
insert into folders (id, user_id, parent_folder_id, name) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', null, 'Work'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221', 'Meeting Notes');

insert into notes (user_id, folder_id, title, body_markdown) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    'Kickoff notes', '# Kickoff\n\nDiscussed scope with #team.');

insert into tags (id, user_id, name, color) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'team', '#f59e0b');

insert into tasks (user_id, title, due_at, priority) values
  ('11111111-1111-1111-1111-111111111111', 'Follow up with team', now() + interval '1 day', 1);
