begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- Structure -----------------------------------------------------------------

select has_table('public', 'matches', 'matches table exists');
select has_table('public', 'match_events', 'match_events table exists');
select col_is_pk('public', 'matches', 'id', 'matches.id is the primary key');
select col_is_pk('public', 'match_events', 'id', 'match_events.id is the primary key');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.matches'::regclass),
  'matches enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.match_events'::regclass),
  'match_events enables and forces RLS'
);

select has_function('public', 'create_match_record', array['uuid', 'jsonb'],
  'create_match_record function exists');
select has_function('public', 'commit_match_action',
  array['uuid', 'integer', 'jsonb', 'jsonb'],
  'commit_match_action function exists');

select table_privs_are('public', 'matches', 'authenticated', array['SELECT'],
  'authenticated users can only select matches');
select table_privs_are('public', 'match_events', 'authenticated', array['SELECT'],
  'authenticated users can only select match_events');
select table_privs_are('public', 'matches', 'anon', array[]::text[],
  'anonymous users have no matches privileges');

select function_privs_are('public', 'create_match_record', array['uuid', 'jsonb'],
  'authenticated', array[]::text[],
  'clients cannot create match records directly');
select function_privs_are('public', 'commit_match_action',
  array['uuid', 'integer', 'jsonb', 'jsonb'],
  'authenticated', array[]::text[],
  'clients cannot commit match actions directly');

select policies_are('public', 'matches', array['matches_select_members'],
  'matches exposes only a membership select policy');
select policies_are('public', 'match_events',
  array['match_events_select_members'],
  'match_events exposes only a membership select policy');

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'host@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Host"}'::jsonb, now(), now());

create temp table ids (name text primary key, id uuid);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into ids (name, id)
select 'room1', id from public.create_room('classic', 4, 'classic', null);

-- Behaviour -----------------------------------------------------------------

insert into ids (name, id)
select 'match1', id from public.create_match_record(
  (select id from ids where name = 'room1'),
  '{"version":0,"status":"active","ruleset":"classic"}'::jsonb
);

select results_eq(
  $$ select status::text from public.rooms
     where id = (select id from ids where name = 'room1') $$,
  array['in_progress'::text],
  'creating a match moves the room to in_progress'
);

-- A correct expected version commits and appends events.
select is(
  public.commit_match_action(
    (select id from ids where name = 'match1'),
    0,
    '{"version":1,"status":"active","ruleset":"classic"}'::jsonb,
    '[{"type":"dice-rolled"},{"type":"token-moved"}]'::jsonb
  ),
  1,
  'commit_match_action advances the version on a matching expectation'
);

select results_eq(
  $$ select seq, type from public.match_events
     where match_id = (select id from ids where name = 'match1')
     order by seq $$,
  $$ values (1, 'dice-rolled'), (2, 'token-moved') $$,
  'committed events are appended with increasing sequence numbers'
);

-- A stale expected version is rejected for resync.
select throws_ok(
  $$ select public.commit_match_action(
       (select id from ids where name = 'match1'), 0,
       '{"version":2,"status":"active","ruleset":"classic"}'::jsonb,
       '[]'::jsonb) $$,
  '40001', null,
  'a stale expected version raises a conflict'
);

select * from finish();

rollback;
