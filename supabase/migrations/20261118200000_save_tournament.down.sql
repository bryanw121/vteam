-- Undo #325: drop save_tournament and put back the insert policy that checked only the creator.
drop function if exists public.save_tournament(jsonb, jsonb);

drop policy if exists "creator can insert tournaments" on public.tournaments;
create policy "creator can insert tournaments" on public.tournaments
  for insert
  with check (created_by = (select auth.uid()));
