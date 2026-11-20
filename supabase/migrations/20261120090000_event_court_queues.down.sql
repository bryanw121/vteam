alter publication supabase_realtime drop table public.event_court_queues;
drop function if exists public.save_court_queue(uuid, integer, text, integer, jsonb, integer, boolean);
drop table if exists public.event_court_queues;
