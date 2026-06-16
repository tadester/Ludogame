-- Direct room invites: a room member invites an accepted friend straight into
-- a room. The invite is a pending row; accepting seats the friend and removes
-- the invite, declining just removes it. All mutations are atomic and
-- security-definer so the table stays select-only for clients.

create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint room_invites_no_self check (inviter_id <> invitee_id),
  constraint room_invites_unique unique (room_id, invitee_id)
);

create index room_invites_invitee on public.room_invites (invitee_id);

alter table public.room_invites enable row level security;
alter table public.room_invites force row level security;

revoke all on table public.room_invites from anon, authenticated;
grant select on table public.room_invites to authenticated;

create policy room_invites_select_involved
  on public.room_invites
  for select
  to authenticated
  using ((select auth.uid()) in (inviter_id, invitee_id));

-- Invite an accepted friend into a room the caller belongs to.
create function public.invite_friend_to_room(p_room_id uuid, p_friend_id uuid)
returns public.room_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms;
  v_count int;
  v_invite public.room_invites;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_friend_id = v_uid then
    raise exception 'you cannot invite yourself' using errcode = '22023';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'this room is no longer open' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = v_uid
  ) then
    raise exception 'only room members can invite friends'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id, f.addressee_id) in (
        (v_uid, p_friend_id), (p_friend_id, v_uid)
      )
  ) then
    raise exception 'you can only invite friends' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_friend_id
  ) then
    raise exception 'that player is already in the room' using errcode = '23505';
  end if;

  select count(*) into v_count from public.room_members
  where room_id = p_room_id;
  if v_count >= v_room.max_players then
    raise exception 'this room is full' using errcode = '23514';
  end if;

  insert into public.room_invites (room_id, inviter_id, invitee_id)
  values (p_room_id, v_uid, p_friend_id)
  on conflict (room_id, invitee_id)
    do update set inviter_id = excluded.inviter_id, created_at = now()
  returning * into v_invite;
  return v_invite;
end;
$$;

-- Accept (seating the caller) or decline a room invite addressed to them.
create function public.respond_to_room_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.room_invites;
  v_room public.rooms;
  v_count int;
  v_seat int;
  v_member public.room_members;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_invite from public.room_invites where id = p_invite_id;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v_invite.invitee_id <> v_uid then
    raise exception 'only the invited player can respond' using errcode = '42501';
  end if;

  if not p_accept then
    delete from public.room_invites where id = p_invite_id;
    return null;
  end if;

  select * into v_room from public.rooms where id = v_invite.room_id;
  if not found or v_room.status <> 'lobby' then
    delete from public.room_invites where id = p_invite_id;
    raise exception 'this room is no longer open to join' using errcode = '22023';
  end if;

  select * into v_member from public.room_members
  where room_id = v_room.id and user_id = v_uid;
  if found then
    delete from public.room_invites where id = p_invite_id;
    return v_member;
  end if;

  select count(*) into v_count from public.room_members
  where room_id = v_room.id;
  if v_count >= v_room.max_players then
    raise exception 'this room is full' using errcode = '23514';
  end if;

  select s into v_seat
  from generate_series(1, v_room.max_players) as s
  where not exists (
    select 1 from public.room_members m
    where m.room_id = v_room.id and m.seat = s
  )
  order by s
  limit 1;

  insert into public.room_members (room_id, user_id, seat)
  values (v_room.id, v_uid, v_seat)
  returning * into v_member;

  delete from public.room_invites where id = p_invite_id;
  return v_member;
end;
$$;

-- List the caller's pending invites to open rooms for display.
create function public.list_room_invites()
returns table (
  invite_id uuid,
  room_id uuid,
  invite_code text,
  ruleset public.ludo_ruleset,
  inviter_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select i.id, r.id, r.invite_code, r.ruleset, p.display_name, i.created_at
  from public.room_invites i
  join public.rooms r on r.id = i.room_id
  join public.profiles p on p.id = i.inviter_id
  where i.invitee_id = (select auth.uid())
    and r.status = 'lobby'
  order by i.created_at desc;
$$;

revoke all on function public.invite_friend_to_room(uuid, uuid)
  from public, anon;
revoke all on function public.respond_to_room_invite(uuid, boolean)
  from public, anon;
revoke all on function public.list_room_invites() from public, anon;

grant execute on function public.invite_friend_to_room(uuid, uuid)
  to authenticated;
grant execute on function public.respond_to_room_invite(uuid, boolean)
  to authenticated;
grant execute on function public.list_room_invites() to authenticated;
