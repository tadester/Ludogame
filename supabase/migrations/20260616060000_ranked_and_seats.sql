-- Ranked lobbies (entry fee -> pot -> winner takes all), multi-seat support
-- (one user may hold several seats / colors), and an admin set-coins helper.

-- Admin: set a user's coins to an exact value (for the /setcoins console cmd).
create function public.admin_set_coins(p_user_id uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles set coins = greatest(0, p_amount) where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_coins(uuid, int) from public, anon;
grant execute on function public.admin_set_coins(uuid, int) to authenticated;

-- Ranked room fields.
alter table public.rooms
  add column is_ranked boolean not null default false,
  add column entry_fee int not null default 0,
  add column pot int not null default 0,
  add column payout_done boolean not null default false,
  add constraint rooms_entry_fee_nonnegative check (entry_fee >= 0),
  add constraint rooms_pot_nonnegative check (pot >= 0);

-- Allow a user to hold more than one seat in a room.
alter table public.room_members drop constraint room_members_unique_user;

-- Create a room. Ranked rooms charge the host an entry fee that seeds the pot.
drop function if exists public.create_room(public.ludo_ruleset, int, text, int);
create function public.create_room(
  p_ruleset public.ludo_ruleset default 'classic',
  p_max_players int default 4,
  p_board_skin text default 'classic',
  p_turn_timer_seconds int default null,
  p_is_ranked boolean default false,
  p_entry_fee int default 0
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid := (select auth.uid());
  v_room public.rooms;
  v_fee int := greatest(0, coalesce(p_entry_fee, 0));
  v_coins int;
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

  if p_is_ranked then
    if v_fee <= 0 then
      raise exception 'ranked rooms need an entry fee' using errcode = '23514';
    end if;
    select coins into v_coins from public.profiles where id = v_host;
    if v_coins < v_fee then
      raise exception 'not enough coins for the entry fee' using errcode = '23514';
    end if;
  else
    v_fee := 0;
  end if;

  insert into public.rooms (
    invite_code, host_id, ruleset, max_players, board_skin,
    turn_timer_seconds, is_ranked, entry_fee, pot
  )
  values (
    private.generate_invite_code(), v_host, p_ruleset, p_max_players,
    coalesce(nullif(trim(p_board_skin), ''), 'classic'),
    p_turn_timer_seconds, p_is_ranked, v_fee,
    case when p_is_ranked then v_fee else 0 end
  )
  returning * into v_room;

  if p_is_ranked then
    update public.profiles set coins = coins - v_fee where id = v_host;
  end if;

  insert into public.room_members (room_id, user_id, seat)
  values (v_room.id, v_host, 1);

  return v_room;
end;
$$;

revoke all on function public.create_room(
  public.ludo_ruleset, int, text, int, boolean, int) from public, anon;
grant execute on function public.create_room(
  public.ludo_ruleset, int, text, int, boolean, int) to authenticated;

-- Charge a ranked entry fee from the caller into the room pot.
create function private.charge_entry_fee(p_room public.rooms, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coins int;
begin
  if not p_room.is_ranked then
    return;
  end if;
  select coins into v_coins from public.profiles where id = p_uid;
  if v_coins < p_room.entry_fee then
    raise exception 'not enough coins for the entry fee' using errcode = '23514';
  end if;
  update public.profiles set coins = coins - p_room.entry_fee where id = p_uid;
  update public.rooms set pot = pot + p_room.entry_fee where id = p_room.id;
end;
$$;

-- Join a room by invite code (first seat). Idempotent: an existing member keeps
-- their seat without paying again.
create or replace function public.join_room(p_invite_code text)
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
  where room_id = v_room.id and user_id = v_uid
  order by seat
  limit 1;
  if found then
    return v_member;
  end if;

  select count(*) into v_count from public.room_members
  where room_id = v_room.id;
  if v_count >= v_room.max_players then
    raise exception 'this room is full' using errcode = '23514';
  end if;

  perform private.charge_entry_fee(v_room, v_uid);

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

-- Take an additional seat in a room you can see (multi-seat). Charges a ranked
-- fee per seat.
create function public.claim_seat(p_room_id uuid)
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
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'this room is no longer open' using errcode = '22023';
  end if;

  select count(*) into v_count from public.room_members where room_id = p_room_id;
  if v_count >= v_room.max_players then
    raise exception 'this room is full' using errcode = '23514';
  end if;

  perform private.charge_entry_fee(v_room, v_uid);

  select s into v_seat
  from generate_series(1, v_room.max_players) as s
  where not exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.seat = s
  )
  order by s
  limit 1;

  insert into public.room_members (room_id, user_id, seat)
  values (p_room_id, v_uid, v_seat)
  returning * into v_member;
  return v_member;
end;
$$;

-- Give up one of your seats. Refunds a ranked fee while still in the lobby.
create function public.release_seat(p_room_id uuid, p_seat int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms;
  v_owner uuid;
  v_next uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return;
  end if;
  select user_id into v_owner from public.room_members
  where room_id = p_room_id and seat = p_seat;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'that is not your seat' using errcode = '42501';
  end if;

  delete from public.room_members where room_id = p_room_id and seat = p_seat;

  if v_room.is_ranked and v_room.status = 'lobby' then
    update public.profiles set coins = coins + v_room.entry_fee where id = v_uid;
    update public.rooms set pot = greatest(0, pot - v_room.entry_fee)
      where id = p_room_id;
  end if;

  if v_room.host_id = v_uid and not exists (
    select 1 from public.room_members where room_id = p_room_id and user_id = v_uid
  ) then
    select user_id into v_next from public.room_members
    where room_id = p_room_id order by joined_at, seat limit 1;
    if v_next is null then
      update public.rooms set status = 'cancelled' where id = p_room_id;
    else
      update public.rooms set host_id = v_next where id = p_room_id;
    end if;
  end if;
end;
$$;

revoke all on function public.claim_seat(uuid) from public, anon;
revoke all on function public.release_seat(uuid, int) from public, anon;
grant execute on function public.claim_seat(uuid) to authenticated;
grant execute on function public.release_seat(uuid, int) to authenticated;

-- Leave a room entirely (all of the caller's seats). Refunds ranked fees while
-- in the lobby, and hands off or cancels if the host leaves.
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.rooms;
  v_seats int;
  v_next uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return;
  end if;

  select count(*) into v_seats from public.room_members
  where room_id = p_room_id and user_id = v_uid;
  if v_seats = 0 then
    return;
  end if;

  delete from public.room_members
  where room_id = p_room_id and user_id = v_uid;

  if v_room.is_ranked and v_room.status = 'lobby' then
    update public.profiles set coins = coins + v_room.entry_fee * v_seats
      where id = v_uid;
    update public.rooms set pot = greatest(0, pot - v_room.entry_fee * v_seats)
      where id = p_room_id;
  end if;

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

-- Settle a completed match: a ranked room pays its whole pot to the winner's
-- owner exactly once.
create function private.settle_ranked_match(p_match_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_winner text;
  v_owner uuid;
begin
  select r.* into v_room
  from public.rooms r
  join public.matches m on m.room_id = r.id
  where m.id = p_match_id;
  if not found then
    return;
  end if;

  update public.rooms set status = 'completed' where id = v_room.id;

  if v_room.is_ranked and not v_room.payout_done and v_room.pot > 0 then
    v_winner := p_snapshot ->> 'winnerPlayerId';
    if v_winner is not null and v_winner <> '' then
      v_owner := split_part(v_winner, '#', 1)::uuid;
      update public.profiles set coins = coins + v_room.pot where id = v_owner;
      update public.rooms set payout_done = true, pot = 0 where id = v_room.id;
    end if;
  end if;
end;
$$;

-- Commit a match action, now also settling ranked payouts on completion.
create or replace function public.commit_match_action(
  p_match_id uuid,
  p_expected_version int,
  p_snapshot jsonb,
  p_events jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current int;
  v_seq int;
  v_new_version int;
begin
  select version into v_current
  from public.matches where id = p_match_id
  for update;
  if not found then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if v_current <> p_expected_version then
    raise exception 'match version conflict' using errcode = '40001';
  end if;

  update public.matches set
    snapshot = p_snapshot,
    version = coalesce((p_snapshot ->> 'version')::int, v_current + 1),
    status = coalesce((p_snapshot ->> 'status')::public.match_status_enum, status)
  where id = p_match_id
  returning version into v_new_version;

  select coalesce(max(seq), 0) into v_seq
  from public.match_events where match_id = p_match_id;

  insert into public.match_events (match_id, seq, type, payload)
  select p_match_id, v_seq + row_number() over (), e ->> 'type', e
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e;

  if (p_snapshot ->> 'status') = 'completed' then
    perform private.settle_ranked_match(p_match_id, p_snapshot);
  end if;

  return v_new_version;
end;
$$;
