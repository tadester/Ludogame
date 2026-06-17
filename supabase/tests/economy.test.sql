begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

-- Structure -----------------------------------------------------------------

select has_column('public', 'profiles', 'role', 'profiles has a role');
select has_column('public', 'profiles', 'coins', 'profiles has coins');
select has_column('public', 'profiles', 'banned', 'profiles has a banned flag');
select has_column('public', 'cosmetic_items', 'price', 'cosmetic_items has a price');

select has_function('public', 'purchase_cosmetic', array['uuid'],
  'purchase_cosmetic exists');
select has_function('public', 'get_player_wallet', '{}'::text[],
  'get_player_wallet exists');
select has_function('public', 'admin_list_users', '{}'::text[],
  'admin_list_users exists');
select has_function('public', 'admin_set_ban', array['uuid', 'boolean'],
  'admin_set_ban exists');
select has_function('public', 'admin_grant_coins', array['uuid', 'integer'],
  'admin_grant_coins exists');

-- Fixtures: the developer email is bootstrapped as admin; a regular player too.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'obasantade@gmail.com', '', now(),
   '{}'::jsonb, '{"display_name":"Tade"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'player@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Player"}'::jsonb, now(), now());

select results_eq(
  $$ select role::text from public.profiles
     where id = '00000000-0000-0000-0000-000000000001' $$,
  array['admin'::text],
  'the developer email is bootstrapped as an admin'
);

select results_eq(
  $$ select (select count(*) from public.cosmetic_ownership
             where user_id = '00000000-0000-0000-0000-000000000001')
          = (select count(*) from public.cosmetic_items) $$,
  array[true],
  'the developer owns every cosmetic'
);

select results_eq(
  $$ select role::text, coins from public.profiles
     where id = '00000000-0000-0000-0000-000000000002' $$,
  $$ values ('player', 200) $$,
  'a regular player starts as a player with 200 coins'
);

-- Purchasing ----------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.purchase_cosmetic(
       (select id from public.cosmetic_items
        where kind = 'background' and code = 'aurora')) $$,
  'a player can buy an affordable cosmetic'
);

select results_eq(
  $$ select coins from public.profiles
     where id = '00000000-0000-0000-0000-000000000002' $$,
  array[50],
  'buying deducts the price from the balance'
);

select throws_ok(
  $$ select public.purchase_cosmetic(
       (select id from public.cosmetic_items
        where kind = 'background' and code = 'aurora')) $$,
  '23505', null,
  'buying an owned item is rejected'
);

select throws_ok(
  $$ select public.purchase_cosmetic(
       (select id from public.cosmetic_items
        where kind = 'background' and code = 'celestial')) $$,
  '23514', null,
  'buying without enough coins is rejected'
);

select results_eq(
  $$ select coins from public.get_player_wallet() $$,
  array[50],
  'get_player_wallet reports the balance'
);

-- Moderation ----------------------------------------------------------------

select throws_ok(
  $$ select * from public.admin_list_users() $$,
  '42501', null,
  'non-admins cannot list users'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.admin_set_ban('00000000-0000-0000-0000-000000000002', true) $$,
  'an admin can ban a player'
);

select results_eq(
  $$ select banned from public.profiles
     where id = '00000000-0000-0000-0000-000000000002' $$,
  array[true],
  'banning sets the flag'
);

select throws_ok(
  $$ select public.admin_set_ban('00000000-0000-0000-0000-000000000001', true) $$,
  '42501', null,
  'admins cannot be banned'
);

select * from finish();

rollback;
