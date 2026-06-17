-- Anime-inspired cosmetic packs (original CSS homages — palettes and motifs,
-- not reproductions of any official artwork or logos). All unlockable.

insert into public.cosmetic_items (kind, code, name, description, is_default, sort_order, price)
values
  -- Backgrounds
  ('background', 'hidden_leaf', 'Hidden Leaf',
   'Sunset glow over a ninja village.', false, 20, 250),
  ('background', 'grand_line', 'Grand Line',
   'Open ocean under a blazing sun.', false, 21, 250),
  ('background', 'elite_classroom', 'Elite Classroom',
   'Cool, minimalist classroom calm.', false, 22, 250),
  ('background', 'cel_shaded', 'Cel Shaded',
   'Bold anime sky with flat clouds.', false, 23, 250),

  -- Boards
  ('board', 'leaf_village', 'Leaf Village',
   'Warm orange-and-green ninja board.', false, 20, 300),
  ('board', 'pirate_seas', 'Pirate Seas',
   'A weathered deck on deep teal water.', false, 21, 300),
  ('board', 'advanced_class', 'Advanced Class',
   'Sleek navy-and-white school board.', false, 22, 400),
  ('board', 'manga_panel', 'Manga Panel',
   'Black-and-white screentone manga look.', false, 23, 300),

  -- Dice
  ('dice', 'crimson_eye', 'Crimson Eye',
   'Glowing crimson dice with a hypnotic sheen.', false, 20, 400),
  ('dice', 'snail_shell', 'Snail Shell',
   'Playful spotted snail-shell dice.', false, 21, 250),

  -- Tokens
  ('token', 'ninja', 'Ninja',
   'Leaf-swirl ninja tokens.', false, 20, 300),
  ('token', 'straw_hat', 'Straw Hat',
   'Pirate tokens banded in red.', false, 21, 300),
  ('token', 'class_point', 'Class Points',
   'Crisp, minimalist elite tokens.', false, 22, 250),

  -- Animation packs
  ('animation', 'shadow_clone', 'Shadow Clone',
   'Snappy moves with a fading afterimage.', false, 20, 400),
  ('animation', 'dramatic', 'Dramatic',
   'Big anime impact on every move.', false, 21, 300),

  -- Effects
  ('effect', 'spiral_orb', 'Spiral Orb',
   'A swirling blue orb bursts on victory.', false, 20, 400),
  ('effect', 'jolly_roger', 'Jolly Roger',
   'A golden pirate flourish on victory.', false, 21, 300);

-- Keep the developer account owning every cosmetic, including these.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = 'obasantade@gmail.com';
  if v_id is not null then
    insert into public.cosmetic_ownership (user_id, item_id)
    select v_id, id from public.cosmetic_items
    on conflict do nothing;
  end if;
end $$;
