begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select results_eq(
  $$ select count(*)::int from public.cosmetic_items
     where code in ('sakura', 'shonen_dawn', 'night_city', 'celestial')
       and kind = 'background' $$,
  array[4],
  'the anime background pack is seeded'
);

select results_eq(
  $$ select count(*)::int from public.cosmetic_items
     where kind = 'animation' and code in ('dynamic', 'smooth') $$,
  array[2],
  'the animation packs are seeded'
);

select is(
  (select bool_and(not is_default) from public.cosmetic_items
   where code in ('sakura', 'crystal', 'star', 'dynamic', 'sparkle')),
  true,
  'anime pack items are unlockable, not defaults'
);

select is(
  (select count(*)::int from public.cosmetic_items
   where is_default and kind = 'background'),
  1,
  'seeding the pack does not add a second default background'
);

select * from finish();

rollback;
