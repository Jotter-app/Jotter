-- Private bucket for the notes-import flow: the browser uploads a vault
-- zip directly here via a signed upload URL, bypassing Vercel's Serverless
-- Function request-body limit (~4.5MB) entirely. The import server action
-- then downloads it back out server-side, processes it, and deletes it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('note-imports', 'note-imports', false, 104857600) -- 100MB
on conflict (id) do nothing;

-- Each object's key is prefixed "<user id>/...", so (storage.foldername)[1]
-- is the owning user -- the same scoping idiom Supabase's own docs use for
-- per-user buckets.
create policy "Users can upload to their own note-imports folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'note-imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can read their own note-imports"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'note-imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own note-imports"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'note-imports' and (storage.foldername(name))[1] = auth.uid()::text);
