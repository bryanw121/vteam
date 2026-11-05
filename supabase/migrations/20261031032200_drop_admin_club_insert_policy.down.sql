-- Restores the admin-only INSERT policy exactly as it was on live.
create policy "Admins insert clubs" on public.clubs
  for insert to public
  with check ((select profiles.is_admin from public.profiles where profiles.id = (select auth.uid())));
