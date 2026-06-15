-- Server-authoritative match persistence. The trusted server (service role)
-- reads the snapshot, applies the shared rules engine, generates dice, and
-- commits the new snapshot plus its domain events atomically here. Clients get
-- read-only access to matches and events for their room so Realtime can stream
-- updates; they never write directly.

-- Mirrors the rules engine's MatchStatus union.
create type public.match_status_enum as enum ('lobby', 'active', 'completed');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  ruleset public.ludo_ruleset not null,
  status public.match_status_enum not null default 'lobby',
  snapshot jsonb not null,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  seq int not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint match_events_unique_seq unique (match_id, seq)
);

create index match_events_match on public.match_events (match_id, seq);

-- Membership check for a match's room, used by the events RLS policy.
create function private.is_match_member(p_match uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    join public.room_members rm on rm.room_id = m.room_id
    where m.id = p_match and rm.user_id = (select auth.uid())
  );
$$;

alter table public.matches enable row level security;
alter table public.matches force row level security;
alter table public.match_events enable row level security;
alter table public.match_events force row level security;

revoke all on table public.matches from anon, authenticated;
revoke all on table public.match_events from anon, authenticated;
grant select on table public.matches to authenticated;
grant select on table public.match_events to authenticated;

create policy matches_select_members
  on public.matches
  for select
  to authenticated
  using (private.is_room_member(room_id));

create policy match_events_select_members
  on public.match_events
  for select
  to authenticated
  using (private.is_match_member(match_id));

create trigger matches_set_updated_at
before update on public.matches
for each row execute function private.touch_updated_at();

-- Create the persisted match for a room from a server-built initial snapshot,
-- and flip the room to in_progress. Service role only.
create function public.create_match_record(p_room_id uuid, p_snapshot jsonb)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
begin
  insert into public.matches (room_id, ruleset, status, snapshot, version)
  values (
    p_room_id,
    (p_snapshot ->> 'ruleset')::public.ludo_ruleset,
    coalesce((p_snapshot ->> 'status')::public.match_status_enum, 'lobby'),
    p_snapshot,
    coalesce((p_snapshot ->> 'version')::int, 0)
  )
  returning * into v_match;

  update public.rooms set status = 'in_progress' where id = p_room_id;

  return v_match;
end;
$$;

-- Atomically commit a new snapshot and its events with optimistic concurrency.
-- Raises a serialization error (40001) on a version conflict so the caller can
-- resync. Service role only.
create function public.commit_match_action(
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

  return v_new_version;
end;
$$;

revoke all on function public.create_match_record(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.commit_match_action(uuid, int, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_match_record(uuid, jsonb)
  to service_role;
grant execute on function public.commit_match_action(uuid, int, jsonb, jsonb)
  to service_role;

-- Stream snapshot and event changes to authorized clients via Realtime. RLS
-- still governs which rows each client may receive.
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_events;
