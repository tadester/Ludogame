begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

-- Structure -----------------------------------------------------------------

select has_table('public', 'rooms', 'rooms table exists');
select has_table('public', 'room_members', 'room_members table exists');
select col_is_pk('public', 'rooms', 'id', 'rooms.id is the primary key');
select col_is_pk('public', 'room_members', 'id', 'room_members.id is the primary key');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.rooms'::regclass),
  'rooms enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.room_members'::regclass),
  'room_members enables and forces RLS'
);

select has_function('public', 'create_room',
  array['public.ludo_ruleset', 'integer', 'text', 'integer', 'boolean', 'integer'],
  'create_room function exists');
select has_function('public', 'join_room', array['text'],
  'join_room function exists');
select has_function('public', 'leave_room', array['uuid'],
  'leave_room function exists');
select has_function('public', 'update_room_settings',
  array['uuid', 'public.ludo_ruleset', 'integer', 'text', 'integer'],
  'update_room_settings function exists');
select has_function('public', 'list_room_members', array['uuid'],
  'list_room_members function exists');

select table_privs_are('public', 'rooms', 'anon', array[]::text[],
  'anonymous users have no rooms privileges');
select table_privs_are('public', 'rooms', 'authenticated', array['SELECT'],
  'authenticated users can only select rooms');
select table_privs_are('public', 'room_members', 'authenticated', array['SELECT'],
  'authenticated users can only select room_members');

select policies_are('public', 'rooms', array['rooms_select_members'],
  'rooms exposes only a membership select policy');
select policies_are('public', 'room_members',
  array['room_members_select_members'],
  'room_members exposes only a membership select policy');

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'host@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Host"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'guest@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Guest"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'third@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Third"}'::jsonb, now(), now());

create temp table ids (name text primary key, id uuid, code text);

-- Create + seat host --------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

with r as (select * from public.create_room('nigerian', 4, 'classic', 60))
insert into ids (name, id, code) select 'room1', r.id, r.invite_code from r;

select results_eq(
  $$ select ruleset::text, status::text, host_id
     from public.rooms where id = (select id from ids where name = 'room1') $$,
  $$ values ('nigerian', 'lobby',
       '00000000-0000-0000-0000-000000000001'::uuid) $$,
  'create_room stores the host and chosen settings'
);

select results_eq(
  $$ select seat from public.room_members
     where room_id = (select id from ids where name = 'room1')
       and user_id = '00000000-0000-0000-0000-000000000001' $$,
  array[1],
  'the host takes seat one'
);

select matches(
  (select code from ids where name = 'room1'),
  '^[A-Z0-9]{6}$',
  'create_room generates a six-character invite code'
);

-- Join by code --------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.join_room((select code from ids where name = 'room1')) $$,
  'a guest can join a room by invite code'
);
select results_eq(
  $$ select seat from public.room_members
     where room_id = (select id from ids where name = 'room1')
       and user_id = '00000000-0000-0000-0000-000000000002' $$,
  array[2],
  'a joining guest takes the next free seat'
);

-- Capacity ------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
with r as (select * from public.create_room('classic', 2, 'classic', null))
insert into ids (name, id, code) select 'room2', r.id, r.invite_code from r;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.join_room((select code from ids where name = 'room2')) $$,
  'a guest fills the second seat of a two-player room'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.join_room((select code from ids where name = 'room2')) $$,
  '23514', null,
  'joining a full room is rejected'
);

-- Host-only settings --------------------------------------------------------

select throws_ok(
  $$ select public.update_room_settings(
       (select id from ids where name = 'room1'), 'classic', 4, 'classic', null) $$,
  '42501', null,
  'a non-host cannot change room settings'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.update_room_settings(
       (select id from ids where name = 'room1'), 'nigerian', 3, 'classic', 90) $$,
  'the host can change room settings while in the lobby'
);
select results_eq(
  $$ select max_players, turn_timer_seconds
     from public.rooms where id = (select id from ids where name = 'room1') $$,
  $$ values (3, 90) $$,
  'updated room settings are stored'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$ select public.join_room((select code from ids where name = 'room1')) $$,
  'a third player joins the resized room'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.update_room_settings(
       (select id from ids where name = 'room1'), 'nigerian', 2, 'classic', 90) $$,
  '23514', null,
  'max players cannot drop below the current member count'
);

-- Leaving + host handoff ----------------------------------------------------

select lives_ok(
  $$ select public.leave_room((select id from ids where name = 'room1')) $$,
  'the host can leave a room'
);
select results_eq(
  $$ select host_id from public.rooms
     where id = (select id from ids where name = 'room1') $$,
  array['00000000-0000-0000-0000-000000000002'::uuid],
  'a leaving host hands off to the longest-seated member'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$ select seat from public.list_room_members(
       (select id from ids where name = 'room1')) $$,
  array[2, 3],
  'list_room_members returns remaining seats for a member'
);

-- Cancel when empty ---------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
with r as (select * from public.create_room('classic', 2, 'classic', null))
insert into ids (name, id, code) select 'room3', r.id, r.invite_code from r;

select lives_ok(
  $$ select public.leave_room((select id from ids where name = 'room3')) $$,
  'the lone host can leave their room'
);
select results_eq(
  $$ select status::text from public.rooms
     where id = (select id from ids where name = 'room3') $$,
  array['cancelled'::text],
  'a room with no members left is cancelled'
);

select * from finish();

rollback;
