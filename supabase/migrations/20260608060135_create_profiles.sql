create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length
    check (username is null or char_length(username) between 3 and 24),
  constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]+$'),
  constraint profiles_display_name_length
    check (char_length(display_name) between 1 and 40)
);

create unique index profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function private.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_profile_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
  requested_username text;
begin
  requested_display_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  requested_display_name := left(
    coalesce(requested_display_name, split_part(new.email, '@', 1), 'Player'),
    40
  );

  requested_username := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));
  if requested_username is not null
    and (
      char_length(requested_username) not between 3 and 24
      or requested_username !~ '^[a-z0-9_]+$'
    )
  then
    requested_username := null;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, requested_display_name);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
