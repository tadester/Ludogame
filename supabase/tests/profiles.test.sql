begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'profiles', 'profiles table exists');
select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');

select results_eq(
  $$
    select c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'f'
  $$,
  array['c'::"char"],
  'profiles foreign key cascades on user deletion'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ),
  'profiles enables and forces RLS'
);

select has_index(
  'public',
  'profiles',
  'profiles_username_lower_unique',
  'profiles has a case-insensitive username index'
);

select table_privs_are(
  'public',
  'profiles',
  'anon',
  array[]::text[],
  'anonymous users have no profiles privileges'
);

select table_privs_are(
  'public',
  'profiles',
  'authenticated',
  array['SELECT', 'UPDATE'],
  'authenticated users can only select and update profiles'
);

select policies_are(
  'public',
  'profiles',
  array['profiles_select_own', 'profiles_update_own'],
  'profiles has only self-access policies'
);

select results_eq(
  $$
    select cmd
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
    order by cmd
  $$,
  array['SELECT'::text, 'UPDATE'::text],
  'profiles policies cover select and update'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'handle_new_user'
  $$,
  array[1::bigint],
  'new-user trigger function is kept in private schema'
);

select has_function('public', 'update_player_profile', array['text', 'text'],
  'update_player_profile function exists');

select function_privs_are('public', 'update_player_profile', array['text', 'text'],
  'authenticated', array['EXECUTE'],
  'authenticated users can update their own profile through the RPC');

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'profile-test@example.com',
  '',
  now(),
  '{}'::jsonb,
  '{"display_name":"Profile Tester","username":"Profile_User"}'::jsonb,
  now(),
  now()
);

select results_eq(
  $$
    select display_name
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000001'
  $$,
  array['Profile Tester'::text],
  'new auth users receive a profile'
);

select results_eq(
  $$
    select username
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000001'
  $$,
  array['profile_user'::text],
  'new-user trigger normalizes usernames'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$
    select display_name || ':' || coalesce(username, '')
    from public.update_player_profile('Updated Player', 'Updated_User')
  $$,
  array['Updated Player:updated_user'::text],
  'update_player_profile updates and normalizes the current user profile'
);

select * from finish();

rollback;
