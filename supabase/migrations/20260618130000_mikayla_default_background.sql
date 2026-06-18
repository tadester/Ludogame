-- Add the "I love you Mikayla" background and make it the default for everyone.

-- Demote any previous default background first so the partial unique index can
-- accept the new default in both fresh and already-seeded databases.
update public.cosmetic_items
  set is_default = false
  where kind = 'background' and is_default;

insert into public.cosmetic_items (kind, code, name, description, is_default, sort_order)
values (
  'background', 'mikayla', 'I love you Mikayla',
  'Feb 14 / 2026 — forever. 💜', true, -1
)
on conflict (kind, code) do update
  set is_default = true,
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- Point every player currently on the old default (or with no background set)
-- at the new default. Players who picked a different background keep it.
do $$
declare
  v_new uuid;
  v_old uuid;
begin
  select id into v_new from public.cosmetic_items
    where kind = 'background' and code = 'mikayla';
  select id into v_old from public.cosmetic_items
    where kind = 'background' and code = 'midnight';
  update public.player_cosmetics
    set background_item_id = v_new
    where background_item_id is null or background_item_id = v_old;
end $$;
