begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_function('public', 'admin_set_coins', array['uuid', 'integer'],
  'admin_set_coins exists');
select has_column('public', 'rooms', 'is_ranked', 'rooms has is_ranked');
select has_column('public', 'rooms', 'entry_fee', 'rooms has entry_fee');
select has_column('public', 'rooms', 'pot', 'rooms has a pot');
select has_function('public', 'claim_seat', array['uuid'], 'claim_seat exists');
select has_function('public', 'release_seat', array['uuid', 'integer'],
  'release_seat exists');

-- Fixtures: dev admin + a player.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'obasantade@gmail.com', '', now(),
   '{}'::jsonb, '{"display_name":"Tade"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'player@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Player"}'::jsonb, now(), now());

create temp table ids (name text primary key, id uuid, code text);

-- admin_set_coins ------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_set_coins('00000000-0000-0000-0000-000000000002', 500) $$,
  'admin can set a player''s coins'
) ;
-- (assertion 7 above counts; keep going)

-- Ranked room creation seeds the pot from the host's coins ------------------
with r as (select * from public.create_room('classic', 4, 'classic', null, true, 100))
insert into ids (name, id, code) select 'room', r.id, r.invite_code from r;

select results_eq(
  $$ select pot from public.rooms where id = (select id from ids where name='room') $$,
  array[100],
  'creating a ranked room seeds the pot with the entry fee'
);
select results_eq(
  $$ select coins from public.profiles
     where id = '00000000-0000-0000-0000-000000000001' $$,
  array[999900],
  'the host pays the entry fee on create'
);

-- Multi-seat: the host claims a second seat --------------------------------
select lives_ok(
  $$ select public.claim_seat((select id from ids where name='room')) $$,
  'a user can claim a second seat'
);
select results_eq(
  $$ select count(*)::int from public.room_members
     where room_id = (select id from ids where name='room')
       and user_id = '00000000-0000-0000-0000-000000000001' $$,
  array[2],
  'the host now holds two seats'
);

-- A player joins the ranked room -------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.join_room((select code from ids where name='room')) $$,
  'a player joins the ranked room'
);
select results_eq(
  $$ select coins from public.profiles
     where id = '00000000-0000-0000-0000-000000000002' $$,
  array[400],
  'the joining player pays the entry fee'
);
select results_eq(
  $$ select pot from public.rooms where id = (select id from ids where name='room') $$,
  array[300],
  'the pot grows with each ranked entry'
);

-- Payout: completing the match pays the pot to the winner's owner ----------
insert into ids (name, id)
select 'match', id from public.create_match_record(
  (select id from ids where name='room'),
  '{"version":0,"status":"active","ruleset":"classic"}'::jsonb
);

select public.commit_match_action(
  (select id from ids where name='match'),
  0,
  '{"version":1,"status":"completed","ruleset":"classic","winnerPlayerId":"00000000-0000-0000-0000-000000000002#red"}'::jsonb,
  '[]'::jsonb
);

select results_eq(
  $$ select coins from public.profiles
     where id = '00000000-0000-0000-0000-000000000002' $$,
  array[700],
  'the winner takes the whole pot (400 + 300)'
);
select results_eq(
  $$ select payout_done from public.rooms
     where id = (select id from ids where name='room') $$,
  array[true],
  'the ranked room is marked paid out'
);

select * from finish();

rollback;
