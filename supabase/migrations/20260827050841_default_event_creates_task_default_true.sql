-- Flips this setting's default to on, matching hide_note_only_tags_from_tasks's
-- precedent: change the column default for new signups AND backfill existing
-- rows, rather than leaving existing accounts stuck on the old default just
-- because they never explicitly touched the setting.
alter table profiles
  alter column default_event_creates_task set default true;

update profiles set default_event_creates_task = true;
