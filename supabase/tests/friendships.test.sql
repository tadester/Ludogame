begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- Structure -----------------------------------------------------------------

select has_table('public', 'friendships', 'friendships table exists');
select col_is_pk('public', 'friendships', 'id', 'friendships.id is the primary key');

select results_eq(
  $$
    select c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'friendships'
      and c.contype = 'f'
    order by 1
  $$,
  array['c'::"char", 'c'::"char"],
  'both friendship foreign keys cascade on user deletion'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.friendships'::regclass
  ),
  'friendships enables and forces RLS'
);

select has_index(
  'public',
  'friendships',
  'friendships_unique_pair',
  'friendships has a unique unordered-pair index'
);

select table_privs_are(
  'public',
  'friendships',
  'anon',
  array[]::text[],
  'anonymous users have no friendships privileges'
);

select table_privs_are(
  'public',
  'friendships',
  'authenticated',
  array['SELECT'],
  'authenticated users can only select friendships'
);

select policies_are(
  'public',
  'friendships',
  array['friendships_select_involved'],
  'friendships exposes only an involvement select policy'
);

select has_function(
  'public', 'send_friend_request', array['uuid'],
  'send_friend_request function exists'
);
select has_function(
  'public', 'respond_to_friend_request', array['uuid', 'boolean'],
  'respond_to_friend_request function exists'
);
select has_function(
  'public', 'remove_friend', array['uuid'],
  'remove_friend function exists'
);
select has_function(
  'public', 'list_friends', '{}'::text[],
  'list_friends function exists'
);
select has_function(
  'public', 'find_profile_by_username', array['text'],
  'find_profile_by_username function exists'
);

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'amaka@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Amaka"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bola@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Bola","username":"bola_ng"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chidi@example.com', '', now(),
   '{}'::jsonb, '{"display_name":"Chidi"}'::jsonb, now(), now());

-- Behaviour: request, accept, remove ----------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.send_friend_request('00000000-0000-0000-0000-000000000001') $$,
  '22023', null,
  'a user cannot send a friend request to themselves'
);

select lives_ok(
  $$ select public.send_friend_request('00000000-0000-0000-0000-000000000002') $$,
  'a user can send a friend request'
);

select results_eq(
  $$
    select status::text from public.friendships
    where requester_id = '00000000-0000-0000-0000-000000000001'
      and addressee_id = '00000000-0000-0000-0000-000000000002'
  $$,
  array['pending'::text],
  'a sent request starts pending'
);

select throws_ok(
  $$ select public.send_friend_request('00000000-0000-0000-0000-000000000002') $$,
  '23505', null,
  'a duplicate request is rejected'
);

-- The wrong user cannot respond.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$
    select public.respond_to_friend_request(
      (select id from public.friendships
       where requester_id = '00000000-0000-0000-0000-000000000001'
         and addressee_id = '00000000-0000-0000-0000-000000000002'),
      true)
  $$,
  '42501', null,
  'only the addressee may respond to a request'
);

-- The addressee accepts.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.respond_to_friend_request(
      (select id from public.friendships
       where requester_id = '00000000-0000-0000-0000-000000000001'
         and addressee_id = '00000000-0000-0000-0000-000000000002'),
      true)
  $$,
  'the addressee can accept a request'
);

select results_eq(
  $$
    select status::text from public.friendships
    where requester_id = '00000000-0000-0000-0000-000000000001'
      and addressee_id = '00000000-0000-0000-0000-000000000002'
  $$,
  array['accepted'::text],
  'an accepted request becomes a friendship'
);

-- Either side can remove the friendship.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.remove_friend('00000000-0000-0000-0000-000000000002') $$,
  'a user can remove a friend'
);
select is(
  (select count(*)::int from public.friendships),
  0,
  'removing a friend deletes the relationship'
);

-- Behaviour: declining a request --------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.send_friend_request('00000000-0000-0000-0000-000000000003') $$,
  'a user can send a request to a third user'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.respond_to_friend_request(
      (select id from public.friendships
       where requester_id = '00000000-0000-0000-0000-000000000001'
         and addressee_id = '00000000-0000-0000-0000-000000000003'),
      false)
  $$,
  'the addressee can decline a request'
);
select is(
  (select count(*)::int from public.friendships),
  0,
  'declining a request removes the row'
);

-- Behaviour: reciprocal request auto-accepts --------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.send_friend_request('00000000-0000-0000-0000-000000000002') $$,
  'first user requests the second again'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.send_friend_request('00000000-0000-0000-0000-000000000001') $$,
  'a reciprocal request is accepted rather than duplicated'
);

select results_eq(
  $$ select status::text from public.friendships $$,
  array['accepted'::text],
  'reciprocal requests collapse into one accepted friendship'
);

-- Behaviour: directory reads -------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select friend_id, display_name, direction from public.list_friends() $$,
  $$ values ('00000000-0000-0000-0000-000000000002'::uuid, 'Bola', 'accepted') $$,
  'list_friends returns the other user and their profile'
);

select results_eq(
  $$ select id from public.find_profile_by_username(' BOLA_NG ') $$,
  array['00000000-0000-0000-0000-000000000002'::uuid],
  'find_profile_by_username matches case-insensitively and trims input'
);

select is_empty(
  $$ select id from public.find_profile_by_username('nobody_here') $$,
  'find_profile_by_username returns nothing for an unknown username'
);

select * from finish();

rollback;
