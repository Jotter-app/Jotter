-- Sync-tracking columns on events. `on delete set null` for
-- calendar_connection_id matches the existing pattern for series_id /
-- linked_task_id / linked_note_id: when the thing an event points at goes
-- away (here, disconnecting Google), the event survives as a plain
-- standalone row rather than cascading.
alter table events add column sync_enabled boolean not null default false;
alter table events add column external_id text;
alter table events add column calendar_connection_id uuid references calendar_connections(id) on delete set null;

-- A connection can't have two Jotter rows claiming the same Google event.
create unique index events_external_id_idx on events (calendar_connection_id, external_id) where external_id is not null;
