-- Undo: back to the three original borders (anyone on storm / aether goes back to no border).
update public.profiles set selected_border = null where selected_border in ('storm', 'aether');

alter table public.profiles
  drop constraint if exists profiles_selected_border_check;

alter table public.profiles
  add constraint profiles_selected_border_check
  check (selected_border = any (array['bronze'::text, 'gold'::text, 'gradient'::text]));
