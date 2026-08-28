-- Widens taggables to a third pillar so events can be tagged too (Tier 3's
-- tag dashboards need every note/task/event carrying a tag, not just
-- notes/tasks). Confirmed the constraint's actual name via
-- `supabase db query "select conname from pg_constraint where conrelid =
-- 'taggables'::regclass and contype = 'c'"` rather than guessing Postgres's
-- default naming.
alter table taggables drop constraint taggables_taggable_type_check;
alter table taggables add constraint taggables_taggable_type_check check (taggable_type in ('note', 'task', 'event'));
