-- Undo 20261107070000_user_settings_hidden_feed.sql exactly.
alter table public.user_settings drop column if exists hidden_feed;
