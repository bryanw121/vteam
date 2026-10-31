-- Enable pg_net on both projects so Database Webhooks can call edge functions.
--
-- The notifications -> send-notification-push webhook (#132) is a trigger that
-- pg_net runs. The trigger itself is created in the live dashboard only
-- (Database -> Webhooks), because it embeds that project's service-role key
-- and pushes to real phones; it is listed in ALLOWED in scripts/schema-drift.mjs.
-- The extension is identical on both projects, so it goes through a migration.
--
-- Expand only. Idempotent.
create extension if not exists pg_net with schema extensions;
