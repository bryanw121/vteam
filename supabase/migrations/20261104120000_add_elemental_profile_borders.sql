-- Add the two skill-specific elemental profile borders.
alter table public.profiles
  drop constraint if exists profiles_selected_border_check;

alter table public.profiles
  add constraint profiles_selected_border_check
  check (selected_border is null or selected_border in ('bronze', 'gold', 'gradient', 'storm', 'aether'));
