begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- Structure -----------------------------------------------------------------

select has_table('public', 'cosmetic_items', 'cosmetic_items table exists');
select has_table('public', 'cosmetic_ownership', 'cosmetic_ownership table exists');
select has_table('public', 'player_cosmetics', 'player_cosmetics table exists');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.cosmetic_items'::regclass),
  'cosmetic_items enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.cosmetic_ownership'::regclass),
  'cosmetic_ownership enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.player_cosmetics'::regclass),
  'player_cosmetics enables and forces RLS'
);

select has_function('public', 'equip_cosmetic', array['uuid'],
  'equip_cosmetic function exists');
select has_function('public', 'update_cosmetic_preferences',
  array['boolean', 'boolean'], 'update_cosmetic_preferences function exists');
select has_function('public', 'get_player_cosmetics', '{}'::text[],
  'get_player_cosmetics function exists');
select has_function('public', 'list_cosmetics', '{}'::text[],
  'list_cosmetics function exists');
select has_function('public', 'grant_cosmetic', array['uuid', 'uuid'],
  'grant_cosmetic function exists');
select has_function('public', 'get_player_theme', '{}'::text[],
  'get_player_theme function exists');

select table_privs_are('public', 'cosmetic_items', 'authenticated',
  array['SELECT'], 'authenticated users can only select the catalog');
select table_privs_are('public', 'player_cosmetics', 'authenticated',
  array['SELECT'], 'authenticated users can only select their loadout');
select function_privs_are('public', 'grant_cosmetic', array['uuid', 'uuid'],
  'authenticated', array[]::text[],
  'clients cannot grant cosmetics directly');

select policies_are('public', 'cosmetic_items',
  array['cosmetic_items_select_all'],
  'cosmetic_items exposes only a public select policy');

select is(
  (select count(*)::int from public.cosmetic_items
   where kind = 'background' and is_default),
  1,
  'exactly one default background is seeded'
);

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'player@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Player"}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Loadout seeding -----------------------------------------------------------

select results_eq(
  $$ select board_item_id from public.get_player_cosmetics() $$,
  $$ select id from public.cosmetic_items where kind = 'board' and is_default $$,
  'get_player_cosmetics seeds the default board'
);

select results_eq(
  $$ select owned from public.list_cosmetics()
     where kind = 'background' and code = 'midnight' $$,
  array[true],
  'default items are owned'
);
select results_eq(
  $$ select owned from public.list_cosmetics()
     where kind = 'background' and code = 'aurora' $$,
  array[false],
  'non-default items are not owned until granted'
);

-- Equipping -----------------------------------------------------------------

select throws_ok(
  $$ select public.equip_cosmetic(
       (select id from public.cosmetic_items
        where kind = 'background' and code = 'aurora')) $$,
  '42501', null,
  'equipping an unowned item is rejected'
);

select lives_ok(
  $$ select public.grant_cosmetic(
       '00000000-0000-0000-0000-000000000001',
       (select id from public.cosmetic_items
        where kind = 'background' and code = 'aurora')) $$,
  'a cosmetic can be granted'
);

select lives_ok(
  $$ select public.equip_cosmetic(
       (select id from public.cosmetic_items
        where kind = 'background' and code = 'aurora')) $$,
  'an owned item can be equipped'
);

select results_eq(
  $$ select background_item_id from public.player_cosmetics
     where user_id = '00000000-0000-0000-0000-000000000001' $$,
  $$ select id from public.cosmetic_items
     where kind = 'background' and code = 'aurora' $$,
  'equipping updates the loadout slot'
);

-- Preferences ---------------------------------------------------------------

select lives_ok(
  $$ select public.update_cosmetic_preferences(true, true) $$,
  'preferences can be updated'
);
select results_eq(
  $$ select reduced_motion, muted_audio from public.player_cosmetics
     where user_id = '00000000-0000-0000-0000-000000000001' $$,
  $$ values (true, true) $$,
  'accessibility preferences are stored'
);

select throws_ok(
  $$ select public.equip_cosmetic('00000000-0000-0000-0000-0000000000ff') $$,
  'P0002', null,
  'equipping a nonexistent item is rejected'
);

select results_eq(
  $$ select background_code, reduced_motion from public.get_player_theme() $$,
  $$ values ('aurora', true) $$,
  'get_player_theme resolves equipped codes and preferences'
);

select * from finish();

rollback;
