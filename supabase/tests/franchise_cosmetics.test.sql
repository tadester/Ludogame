begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select results_eq(
  $$ select count(*)::int from public.cosmetic_items
     where code in ('hidden_leaf', 'grand_line', 'elite_classroom', 'cel_shaded')
       and kind = 'background' $$,
  array[4],
  'the anime-inspired backgrounds are seeded'
);

select results_eq(
  $$ select count(*)::int from public.cosmetic_items
     where kind = 'token' and code in ('ninja', 'straw_hat', 'class_point') $$,
  array[3],
  'the themed token packs are seeded'
);

select is(
  (select bool_and(price > 0 and not is_default) from public.cosmetic_items
   where code in ('ninja', 'crimson_eye', 'shadow_clone', 'spiral_orb',
                  'advanced_class')),
  true,
  'franchise items are priced unlockables'
);

select is(
  (select count(*)::int from public.cosmetic_items
   where is_default and kind = 'board'),
  1,
  'seeding the pack keeps a single default board'
);

select * from finish();

rollback;
