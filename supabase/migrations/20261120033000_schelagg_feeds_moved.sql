-- Schelagg's repository was renamed bryanw121/schelagg -> bryanw121/skelly (Nov 19, 2026).
-- GitHub Pages follows the repository name and leaves no redirect, so both public feeds moved:
--   https://bryanw121.github.io/schelagg/data/occurrences.json -> .../skelly/data/occurrences.json
--   https://bryanw121.github.io/schelagg/data/programs.json    -> .../skelly/data/programs.json
-- and the hourly imports started failing with HTTP 404 (nothing is deleted on a failed fetch;
-- rows just stop being refreshed and age out of the feed).
--
-- This rewrites only the fixed URL inside the two import functions, from their current
-- definitions, so everything else about them (mapping, staleness guards, grants) is untouched.
do $$
declare
  f text;
  def text;
begin
  foreach f in array array['ingest_schelagg_feed', 'ingest_schelagg_programs'] loop
    select pg_get_functiondef(p.oid) into strict def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = f;
    if position('https://bryanw121.github.io/schelagg/data/' in def) = 0 then
      raise exception '%: expected the old feed URL in its definition', f;
    end if;
    execute replace(def, 'https://bryanw121.github.io/schelagg/data/', 'https://bryanw121.github.io/skelly/data/');
  end loop;
end
$$;
