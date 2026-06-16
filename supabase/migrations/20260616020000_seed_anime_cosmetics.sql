-- Anime-themed cosmetic content pack. All items are unlockable (non-default);
-- they render via CSS keyed on their code. Ownership is granted via
-- grant_cosmetic (purchases/rewards are a future concern).

insert into public.cosmetic_items (kind, code, name, description, is_default, sort_order)
values
  -- Backgrounds
  ('background', 'sakura', 'Sakura Drift',
   'Soft cherry-blossom petals over a pink dusk.', false, 10),
  ('background', 'shonen_dawn', 'Shonen Dawn',
   'Blazing sunrise for a hot-blooded showdown.', false, 11),
  ('background', 'night_city', 'Neon City',
   'Rain-slick cyberpunk skyline in neon.', false, 12),
  ('background', 'celestial', 'Celestial',
   'A quiet field of distant stars.', false, 13),

  -- Boards
  ('board', 'sakura_grove', 'Sakura Grove',
   'Blossom-pink board with a soft glow.', false, 10),
  ('board', 'neon_grid', 'Neon Grid',
   'Dark board lit by a cyan circuit grid.', false, 11),
  ('board', 'sumi_ink', 'Sumi-e Ink',
   'Hand-inked monochrome brushwork.', false, 12),

  -- Dice
  ('dice', 'crystal', 'Crystal Dice',
   'Translucent dice that catch the light.', false, 10),
  ('dice', 'shonen_gold', 'Shonen Gold',
   'Gilded dice with a warm aura.', false, 11),

  -- Tokens
  ('token', 'star', 'Star Tokens',
   'Five-point star tokens for a magical-girl vibe.', false, 10),
  ('token', 'crystal', 'Crystal Tokens',
   'Glassy, faceted crystal tokens.', false, 11),

  -- Animation packs
  ('animation', 'dynamic', 'Dynamic',
   'Exaggerated anime motion with snappy overshoot.', false, 10),
  ('animation', 'smooth', 'Smooth Glide',
   'Calm, gliding movement and gentle dice.', false, 11),

  -- Effects
  ('effect', 'sparkle', 'Sparkle',
   'Shimmering sparkles when you win.', false, 10),
  ('effect', 'speed_lines', 'Speed Lines',
   'Anime speed lines on the winning flourish.', false, 11);
