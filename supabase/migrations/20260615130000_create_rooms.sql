-- Private rooms: a host creates a room, others join with the invite code, and
-- everyone occupies a numbered seat. The host controls ruleset, capacity,
-- board skin, and the optional turn timer while the room is still in the lobby.
-- All mutations run through atomic security-definer functions; the tables stay
-- select-only for clients and reads are gated by membership.

create type public.ludo_ruleset as enum ('classic', 'nigerian');
create type public.room_status as enum
  ('lobby', 'in_progress', 'completed', 'cancelled');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  ruleset public.ludo_ruleset not null default 'classic',
  max_players int not null default 4,
  board_skin text not null default 'classic',
  turn_timer_seconds int,
  status public.room_status not null default 'lobby',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_max_players_range check (max_players between 2 and 4),
  constraint rooms_turn_timer_allowed
    check (turn_timer_seconds is null or turn_timer_seconds in (30, 60, 90)),
  constraint rooms_invite_code_format check (invite_code ~ '^[A-Z0-9]{6}$')
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat int not null,
  joined_at timestamptz not null default now(),
  constraint room_members_seat_range check (seat between 1 and 4),
  constraint room_members_unique_user unique (room_id, user_id),
  constraint room_members_unique_seat unique (room_id, seat)
);

create index room_members_user on public.room_members (user_id);

-- Membership check used by RLS policies on both tables. Defined in the private
-- schema and security-definer so policies do not recurse through each other.
create function private.is_room_member(p_room uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = (select auth.uid())
  );
$$;

alter table public.rooms enable row level security;
alter table public.rooms force row level security;
alter table public.room_members enable row level security;
alter table public.room_members force row level security;

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.room_members from anon, authenticated;
grant select on table public.rooms to authenticated;
grant select on table public.room_members to authenticated;

create policy rooms_select_members
  on public.rooms
  for select
  to authenticated
  using (private.is_room_member(id));

create policy room_members_select_members
  on public.room_members
  for select
  to authenticated
  using (private.is_room_member(room_id));

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function private.touch_updated_at();

-- Generate a unique six-character invite code, avoiding ambiguous characters.
create function private.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code
        || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.rooms where invite_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

-- Create a room and seat the host at seat one.
create function public.create_room(
  p_ruleset public.ludo_ruleset default 'classic',
  p_max_players int default 4,
  p_board_skin text default 'classic',
  p_turn_timer_seconds int default null
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid := (select auth.uid());
  v_room public.rooms;
begin
  if v_host is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_max_players not between 2 and 4 then
    raise exception 'rooms allow two to four players' using errcode = '23514';
  end if;
  if p_turn_timer_seconds is not null
    and p_turn_timer_seconds not in (30, 60, 90)
  then
    raise exception 'turn timer must be 30, 60, or 90 seconds'
      using errcode = '23514';
  end if;

  insert into public.rooms (
    invite_code, host_id, ruleset, max_players, board_skin, turn_timer_seconds
  )
  values (
    private.generate_invite_code(),
    v_host,
    p_ruleset,
    p_max_players,
    coalesce(nullif(trim(p_board_skin), ''), 'classic'),
    p_turn_timer_seconds
  )
  returning * into v_room;

  insert into public.room_members (room_id, user_id, seat)
  values (v_room.id, v_host, 1);

  return v_room;
end;
$$;

-- Join a room by invite code, taking the lowest free seat. Rejoining returns
-- the caller's existing seat instead of failing.
create function public.join_room(p_invite_code text)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms;
  v_count int;
  v_seat int;
  v_member public.room_members;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_room from public.rooms
  where invite_code = upper(trim(p_invite_code));
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'this room is no longer open to join' using errcode = '22023';
  end if;

  select * into v_member from public.room_members
  where room_id = v_room.id and user_id = v_uid;
  if found then
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
  return v_member;
end;
$$;

-- Leave a room. If the host leaves, hand off to the longest-seated remaining
-- member, or cancel the room when it becomes empty.
create function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms;
  v_next uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return;
  end if;

  delete from public.room_members
  where room_id = p_room_id and user_id = v_uid;

  if v_room.host_id = v_uid then
    select user_id into v_next from public.room_members
    where room_id = p_room_id
    order by joined_at, seat
    limit 1;

    if v_next is null then
      update public.rooms set status = 'cancelled' where id = p_room_id;
    else
      update public.rooms set host_id = v_next where id = p_room_id;
    end if;
  end if;
end;
$$;

-- Host-only settings update, allowed only while the room is in the lobby.
create function public.update_room_settings(
  p_room_id uuid,
  p_ruleset public.ludo_ruleset,
  p_max_players int,
  p_board_skin text,
  p_turn_timer_seconds int
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms;
  v_count int;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.host_id <> v_uid then
    raise exception 'only the host can change room settings'
      using errcode = '42501';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'settings are locked once the match starts'
      using errcode = '22023';
  end if;
  if p_max_players not between 2 and 4 then
    raise exception 'rooms allow two to four players' using errcode = '23514';
  end if;

  select count(*) into v_count from public.room_members
  where room_id = p_room_id;
  if p_max_players < v_count then
    raise exception 'cannot set max players below the current member count'
      using errcode = '23514';
  end if;
  if p_turn_timer_seconds is not null
    and p_turn_timer_seconds not in (30, 60, 90)
  then
    raise exception 'turn timer must be 30, 60, or 90 seconds'
      using errcode = '23514';
  end if;

  update public.rooms set
    ruleset = p_ruleset,
    max_players = p_max_players,
    board_skin = coalesce(nullif(trim(p_board_skin), ''), 'classic'),
    turn_timer_seconds = p_turn_timer_seconds
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

-- List a room's members with profile details for the lobby. Restricted to
-- members of the room.
create function public.list_room_members(p_room_id uuid)
returns table (
  user_id uuid,
  seat int,
  display_name text,
  username text,
  is_host boolean,
  joined_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select m.user_id, m.seat, p.display_name, p.username,
    (r.host_id = m.user_id), m.joined_at
  from public.room_members m
  join public.rooms r on r.id = m.room_id
  join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id
    and exists (
      select 1 from public.room_members me
      where me.room_id = p_room_id and me.user_id = (select auth.uid())
    )
  order by m.seat;
$$;

revoke all on function public.create_room(public.ludo_ruleset, int, text, int)
  from public, anon;
revoke all on function public.join_room(text) from public, anon;
revoke all on function public.leave_room(uuid) from public, anon;
revoke all on function public.update_room_settings(
  uuid, public.ludo_ruleset, int, text, int) from public, anon;
revoke all on function public.list_room_members(uuid) from public, anon;

grant execute on function public.create_room(public.ludo_ruleset, int, text, int)
  to authenticated;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.update_room_settings(
  uuid, public.ludo_ruleset, int, text, int) to authenticated;
grant execute on function public.list_room_members(uuid) to authenticated;
