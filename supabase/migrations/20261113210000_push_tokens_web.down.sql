alter table public.push_tokens drop constraint if exists push_tokens_web_keys_check;
alter table public.push_tokens drop column if exists web_keys;
