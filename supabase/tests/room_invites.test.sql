begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Structure -----------------------------------------------------------------

select has_table('public', 'room_invites', 'room_invites table exists');
select col_is_pk('public', 'room_invites', 'id', 'room_invites.id is the primary key');
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.room_invites'::regclass),
  'room_invites enables and forces RLS'
);
select has_function('public', 'invite_friend_to_room', array['uuid', 'uuid'],
  'invite_friend_to_room function exists');
select has_function('public', 'respond_to_room_invite', array['uuid', 'boolean'],
  'respond_to_room_invite function exists');
select has_function('public', 'list_room_invites', '{}'::text[],
  'list_room_invites function exists');
select table_privs_are('public', 'room_invites', 'anon', array[]::text[],
  'anonymous users have no room_invites privileges');
select table_privs_are('public', 'room_invites', 'authenticated', array['SELECT'],
  'authenticated users can only select room_invites');
select policies_are('public', 'room_invites',
  array['room_invites_select_involved'],
  'room_invites exposes only an involvement select policy');

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'host@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Host"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Friend"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Stranger"}'::jsonb, now(), now());

-- Host and friend are accepted friends; the stranger is not.
insert into public.friendships (requester_id, addressee_id, status)
values ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002', 'accepted');

create temp table ids (name text primary key, id uuid);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids (name, id)
select 'room1', id from public.create_room('classic', 4, 'classic', null);

-- Inviting friends ----------------------------------------------------------

select lives_ok(
  $$ select public.invite_friend_to_room(
       (select id from ids where name = 'room1'),
       '00000000-0000-0000-0000-000000000002') $$,
  'a member can invite an accepted friend'
);

select throws_ok(
  $$ select public.invite_friend_to_room(
       (select id from ids where name = 'room1'),
       '00000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'a non-friend cannot be invited'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$ select room_id from public.list_room_invites() $$,
  $$ select id from ids where name = 'room1' $$,
  'an invitee sees their pending room invite'
);

-- Responding ----------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$
    select public.respond_to_room_invite(
      (select id from public.room_invites
       where invitee_id = '00000000-0000-0000-0000-000000000002'),
      true)
  $$,
  '42501', null,
  'only the invited player can respond'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.respond_to_room_invite(
      (select id from public.room_invites
       where invitee_id = '00000000-0000-0000-0000-000000000002'),
      true)
  $$,
  'the invited friend can accept and be seated'
);

select results_eq(
  $$ select seat from public.room_members
     where room_id = (select id from ids where name = 'room1')
       and user_id = '00000000-0000-0000-0000-000000000002' $$,
  array[2],
  'accepting an invite seats the friend'
);

select is(
  (select count(*)::int from public.room_invites),
  0,
  'accepting an invite removes it'
);

-- Inviting someone already seated is rejected.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.invite_friend_to_room(
       (select id from ids where name = 'room1'),
       '00000000-0000-0000-0000-000000000002') $$,
  '23505', null,
  'inviting a player already in the room is rejected'
);

select * from finish();

rollback;
