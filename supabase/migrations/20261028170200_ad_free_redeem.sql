-- Spend points to remove ads (#14).
--
--   ad_free_offer()        the one place the price lives: 100 points buys 30
--                          days. The app shows whatever this returns.
--   ad_free_passes         user_id -> ad_free_until. Owner-only SELECT, no
--                          client writes (user_settings is client-writable,
--                          so the entitlement can't live there).
--   get_ad_free_status()   the caller's balance, ad_free_until and the offer,
--                          in one call (settings screen + useAdsEnabled).
--   redeem_ad_free()       atomically debits the offer's cost from the ledger
--                          (point_events row, reason 'redeem_ad_free') and
--                          extends ad_free_until by the offer's days, from the
--                          current expiry when one is still running, else from
--                          now. An insufficient balance returns ok = false and
--                          changes nothing.
--
-- Double-spend safety: redeem takes a per-user transaction advisory lock (so
-- two concurrent redemptions run one after the other, even before the user has
-- a balance row), then locks the balance row FOR UPDATE and re-reads it. The
-- balance >= 0 CHECK on point_balances is the last line of defence.

create or replace function public.ad_free_offer()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('cost', 100, 'days', 30)
$$;

grant execute on function public.ad_free_offer() to anon, authenticated;

create table if not exists public.ad_free_passes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ad_free_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.ad_free_passes enable row level security;
revoke all on public.ad_free_passes from anon, authenticated;
grant select on public.ad_free_passes to authenticated;

drop policy if exists "Users read their own ad-free pass" on public.ad_free_passes;
create policy "Users read their own ad-free pass" on public.ad_free_passes
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_ad_free_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.ad_free_offer() || jsonb_build_object(
    'balance', coalesce((select b.balance from public.point_balances b where b.user_id = (select auth.uid())), 0),
    'ad_free_until', (select p.ad_free_until from public.ad_free_passes p where p.user_id = (select auth.uid()))
  )
$$;

revoke all on function public.get_ad_free_status() from public, anon;
grant execute on function public.get_ad_free_status() to authenticated;

create or replace function public.redeem_ad_free()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  offer jsonb := public.ad_free_offer();
  v_cost integer := (offer->>'cost')::integer;
  v_days integer := (offer->>'days')::integer;
  current_balance integer;
  current_until timestamptz;
  new_until timestamptz;
begin
  if uid is null then
    raise exception 'Sign in to redeem points' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('redeem_ad_free:' || uid::text, 0));

  select b.balance into current_balance
  from public.point_balances b
  where b.user_id = uid
  for update;
  current_balance := coalesce(current_balance, 0);

  select p.ad_free_until into current_until
  from public.ad_free_passes p
  where p.user_id = uid;

  if current_balance < v_cost then
    return offer || jsonb_build_object('ok', false, 'reason', 'insufficient_points',
      'balance', current_balance, 'ad_free_until', current_until);
  end if;

  insert into public.point_events (user_id, amount, reason)
  values (uid, -v_cost, 'redeem_ad_free');

  new_until := greatest(coalesce(current_until, now()), now()) + make_interval(days => v_days);

  insert into public.ad_free_passes (user_id, ad_free_until, updated_at)
  values (uid, new_until, now())
  on conflict (user_id) do update
    set ad_free_until = excluded.ad_free_until, updated_at = now();

  return offer || jsonb_build_object('ok', true, 'balance', current_balance - v_cost, 'ad_free_until', new_until);
end;
$$;

revoke all on function public.redeem_ad_free() from public, anon;
grant execute on function public.redeem_ad_free() to authenticated;
