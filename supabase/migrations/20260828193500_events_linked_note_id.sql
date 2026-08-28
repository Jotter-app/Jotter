-- An event can optionally have a generated meeting note (Jotter's
-- meeting-note generation). on delete set null: deleting the note un-links
-- the event rather than deleting it; deleting the event itself never
-- touches the note.
alter table events add column linked_note_id uuid references notes(id) on delete set null;

create index events_linked_note_idx on events (linked_note_id) where linked_note_id is not null;
