-- Friend relationships: a single row per pair of users, regardless of who
-- initiated. A pending row is a request; an accepted row is a friendship.
-- All mutations go through atomic security-definer functions so the table can
-- stay select-only for clients while invariants are enforced server-side.

create type public.friendship_status as enum ('pending', 'accepted');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- One relationship per unordered pair: (a, b) and (b, a) collide.
create unique index friendships_unique_pair
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index friendships_addressee_pending
  on public.friendships (addressee_id)
  where status = 'pending';

alter table public.friendships enable row level security;
alter table public.friendships force row level security;

revoke all on table public.friendships from anon, authenticated;
grant select on table public.friendships to authenticated;

-- Clients may read only relationships they are part of.
create policy friendships_select_involved
  on public.friendships
  for select
  to authenticated
  using (
    (select auth.uid()) in (requester_id, addressee_id)
  );

-- Reusable updated_at trigger that does not assume a particular table.
create function private.touch_updated_at()
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

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function private.touch_updated_at();

-- Send a friend request. If the other user already has a pending request to
-- the caller, this accepts it instead (reciprocal requests become friends).
create function public.send_friend_request(p_addressee uuid)
returns public.friendships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester uuid := (select auth.uid());
  v_existing public.friendships;
  v_result public.friendships;
begin
  if v_requester is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_addressee is null or p_addressee = v_requester then
    raise exception 'cannot send a friend request to yourself'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_addressee) then
    raise exception 'user does not exist' using errcode = '23503';
  end if;

  select * into v_existing
  from public.friendships
  where (requester_id, addressee_id) in (
    (v_requester, p_addressee),
    (p_addressee, v_requester)
  );

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'already friends' using errcode = '23505';
    end if;
    if v_existing.requester_id = p_addressee then
      -- They requested us first; accept rather than create a duplicate.
      update public.friendships
        set status = 'accepted'
        where id = v_existing.id
        returning * into v_result;
      return v_result;
    end if;
    raise exception 'friend request already pending' using errcode = '23505';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_requester, p_addressee)
  returning * into v_result;
  return v_result;
end;
$$;

-- Accept or decline a pending request addressed to the caller. Declining
-- removes the row so a fresh request can be sent later.
create function public.respond_to_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.friendships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.friendships;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_row from public.friendships where id = p_request_id;
  if not found then
    raise exception 'friend request not found' using errcode = 'P0002';
  end if;
  if v_row.addressee_id <> v_uid then
    raise exception 'only the addressee can respond to this request'
      using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'request is no longer pending' using errcode = '22023';
  end if;

  if p_accept then
    update public.friendships
      set status = 'accepted'
      where id = p_request_id
      returning * into v_row;
    return v_row;
  end if;

  delete from public.friendships where id = p_request_id;
  return null;
end;
$$;

-- Remove a friendship or withdraw a pending request, in either direction.
create function public.remove_friend(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  delete from public.friendships
  where (requester_id, addressee_id) in (
    (v_uid, p_other),
    (p_other, v_uid)
  );
end;
$$;

-- Read the caller's friendships joined to the other user's profile. Runs as
-- definer so it can read friends' profiles without broadening profiles RLS.
create function public.list_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  display_name text,
  username text,
  status public.friendship_status,
  direction text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    f.id,
    case when f.requester_id = (select auth.uid())
      then f.addressee_id else f.requester_id end,
    p.display_name,
    p.username,
    f.status,
    case
      when f.status = 'accepted' then 'accepted'
      when f.requester_id = (select auth.uid()) then 'outgoing'
      else 'incoming'
    end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = (select auth.uid())
      then f.addressee_id else f.requester_id end
  where (select auth.uid()) in (f.requester_id, f.addressee_id)
  order by f.status, f.created_at;
$$;

-- Resolve another user by exact (case-insensitive) username so friends can be
-- added without exposing the whole profiles table to clients.
create function public.find_profile_by_username(p_username text)
returns table (id uuid, display_name text, username text)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username
  from public.profiles p
  where p.username is not null
    and lower(p.username) = lower(trim(p_username))
    and p.id <> (select auth.uid())
  limit 1;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean)
  from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.find_profile_by_username(text) from public, anon;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean)
  to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.find_profile_by_username(text) to authenticated;
