-- What a player has hidden from their Events feed (Settings → Hidden in feed).
-- A JSON array of entries, each { kind, key, label, until? }:
--   kind 'item'  : one feed item (key = event id, or `external:<id>` for an outside session; `until` = its date)
--   kind 'venue' : every outside session at a venue (key = lower-cased venue name)
--   kind 'host'  : every event a host created (key = their user id)
--   kind 'type'  : every event of a type (key = `tag:<lower-cased tag name>` or `surface:<indoor|sand|grass>`)
-- `label` is what the settings list shows, saved at hide time. The app reads
-- and writes it (owner-only RLS on user_settings already covers it); the
-- server never acts on it. Capped so a runaway client can't grow the row.
alter table public.user_settings
  add column if not exists hidden_feed jsonb not null default '[]'::jsonb
  constraint user_settings_hidden_feed_check check (
    jsonb_typeof(hidden_feed) = 'array' and jsonb_array_length(hidden_feed) <= 500
  );

comment on column public.user_settings.hidden_feed is
  'Feed items, venues, hosts and types this player hid from their Events feed: [{kind, key, label, until?}]. Client-managed.';
