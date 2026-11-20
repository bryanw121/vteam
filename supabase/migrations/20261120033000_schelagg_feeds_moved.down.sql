-- Undo 20261120033000_schelagg_feeds_moved.sql: point the two imports back at the old feed URLs.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array['ingest_schelagg_feed', 'ingest_schelagg_programs'] loop
    select pg_get_functiondef(p.oid) into strict def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = f;
    execute replace(def, 'https://bryanw121.github.io/skelly/data/', 'https://bryanw121.github.io/schelagg/data/');
  end loop;
end
$$;
