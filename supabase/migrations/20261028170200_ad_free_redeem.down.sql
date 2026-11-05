-- Undo 20261028170200_ad_free_redeem.sql.
drop function if exists public.redeem_ad_free();
drop function if exists public.get_ad_free_status();
drop table if exists public.ad_free_passes;
drop function if exists public.ad_free_offer();
