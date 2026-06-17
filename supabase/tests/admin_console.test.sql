begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_function('public', 'admin_find_user', array['text'],
  'admin_find_user exists');
select has_function('public', 'admin_set_role',
  array['uuid', 'public.app_role'], 'admin_set_role exists');
select has_function('public', 'admin_grant_cosmetic', array['uuid', 'text'],
  'admin_grant_cosmetic exists');
select has_function('public', 'admin_grant_coins_all', array['integer'],
  'admin_grant_coins_all exists');
select has_function('public', 'admin_stats', '{}'::text[],
  'admin_stats exists');

-- Fixtures: the dev email is bootstrapped admin; plus a regular player.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'obasantade@gmail.com', '', now(),
   '{}'::jsonb, '{"display_name":"Tade","username":"tade"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'player@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Player","username":"player1"}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select username from public.admin_find_user('player1') $$,
  array['player1'::text],
  'admin_find_user resolves a player by username'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.admin_find_user('tade') $$,
  '42501', null,
  'non-admins cannot use admin_find_user'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select public.admin_grant_cosmetic(
       '00000000-0000-0000-0000-000000000002', 'aurora') $$,
  array[1],
  'admin_grant_cosmetic grants a matching item'
);

select lives_ok(
  $$ select public.admin_set_role(
       '00000000-0000-0000-0000-000000000002', 'admin') $$,
  'admin_set_role promotes a player'
);
select results_eq(
  $$ select role::text from public.profiles
     where id = '00000000-0000-0000-0000-000000000002' $$,
  array['admin'::text],
  'the player is now an admin'
);

select results_eq(
  $$ select total_users from public.admin_stats() $$,
  array[2::bigint],
  'admin_stats counts all users'
);

select * from finish();

rollback;
