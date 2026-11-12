-- Undo 20261028120300_conversation_members_insert.sql.
create policy "Can insert self as member" on public.conversation_members
  for insert to authenticated
  with check (user_id = ( SELECT auth.uid() AS uid));
