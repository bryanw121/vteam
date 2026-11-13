-- Web push (#189): browser subscriptions live in push_tokens like Expo tokens.
-- token = the subscription endpoint, platform = 'web', web_keys = {p256dh, auth}
-- (the browser's public key and auth secret the edge functions encrypt to).
-- Same owner-only RLS as today. Expand only: a nullable column and a check.

alter table public.push_tokens add column if not exists web_keys jsonb;

comment on column public.push_tokens.web_keys is
  'Web Push subscription keys {p256dh, auth} for platform = web (#189); null for Expo tokens.';

alter table public.push_tokens drop constraint if exists push_tokens_web_keys_check;
alter table public.push_tokens add constraint push_tokens_web_keys_check
  check (platform <> 'web' or (jsonb_typeof(web_keys) = 'object' and web_keys ? 'p256dh' and web_keys ? 'auth')) not valid;
alter table public.push_tokens validate constraint push_tokens_web_keys_check;
