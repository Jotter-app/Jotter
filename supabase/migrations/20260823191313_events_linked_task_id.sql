-- An event can optionally have a companion task that stays in sync with it
-- (Jotter's event<->task linking). on delete set null: deleting the task
-- un-links the event rather than deleting it; deleting the event itself
-- decides the task's fate explicitly in application code (see
-- lib/actions/events.ts's deleteEvent), never silently.
alter table events add column linked_task_id uuid references tasks(id) on delete set null;

create index events_linked_task_idx on events (linked_task_id) where linked_task_id is not null;
