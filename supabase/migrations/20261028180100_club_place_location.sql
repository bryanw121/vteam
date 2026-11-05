-- #13: a club can have any geocoded location (Google Places), not just a
-- curated metro. The metro (major_city_id → major_cities) stays required: it is
-- what Clubs discovery groups and searches by, and the app pre-fills it from
-- the chosen place when the place is in a curated metro.
--
-- All new columns are nullable (clubs without a fixed home court, and every
-- club created by the app version currently installed). Additive only.

alter table public.clubs
  add column if not exists location_name    text,
  add column if not exists location_address text,
  add column if not exists latitude         double precision,
  add column if not exists longitude        double precision,
  add column if not exists place_id         text;

alter table public.clubs
  add constraint clubs_location_name_len    check (location_name is null or char_length(location_name) between 1 and 200),
  add constraint clubs_location_address_len check (location_address is null or char_length(location_address) <= 300),
  add constraint clubs_place_id_len         check (place_id is null or char_length(place_id) between 1 and 300),
  add constraint clubs_coords_valid check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  -- Coordinates or an address only make sense with a name to show.
  add constraint clubs_location_has_name check (
    location_name is not null or (location_address is null and latitude is null and place_id is null)
  );

comment on column public.clubs.location_name    is 'Home court / meeting place name shown on the club page (#13). Null = no fixed location.';
comment on column public.clubs.location_address is 'Formatted address of the club location, from Google Places or the curated venue list.';
comment on column public.clubs.latitude         is 'Club location latitude (WGS84), from Google Places details. Null when unknown.';
comment on column public.clubs.longitude        is 'Club location longitude (WGS84), from Google Places details. Null when unknown.';
comment on column public.clubs.place_id         is 'Google Places place_id of the club location, when it came from Places search.';
