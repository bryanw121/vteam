-- Undo 20261028180100_club_place_location.sql
alter table public.clubs
  drop constraint if exists clubs_location_has_name,
  drop constraint if exists clubs_coords_valid,
  drop constraint if exists clubs_place_id_len,
  drop constraint if exists clubs_location_address_len,
  drop constraint if exists clubs_location_name_len;

alter table public.clubs
  drop column if exists place_id,
  drop column if exists longitude,
  drop column if exists latitude,
  drop column if exists location_address,
  drop column if exists location_name;
