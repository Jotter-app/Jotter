-- Lets a note be starred for quick access via the "Starred" view, without
-- touching updated_at semantics beyond what the existing moddatetime
-- trigger already does on any row update (same tradeoff archived_at and
-- completed_at already accept) -- no separate starred_at, this is a plain
-- boolean flag, not a timestamp anyone needs to sort or display by.
alter table notes add column starred boolean not null default false;
