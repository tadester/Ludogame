-- Delete idle/abandoned rooms to save storage.
--
-- Removes rooms that no one is in any more (no members) once they have been
-- idle for a couple of hours, plus any lobby/cancelled/completed room left
-- untouched for a day. Active in-progress rooms with members are kept.

create index if not exists rooms_updated_at_idx
  on public.rooms (updated_at);

create function public.cleanup_idle_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from public.rooms r
    where (
      not exists (
        select 1 from public.room_members m where m.room_id = r.id
      )
      and r.updated_at < now() - interval '2 hours'
    )
    or (
      r.status in ('lobby', 'cancelled', 'completed')
      and r.updated_at < now() - interval '24 hours'
    )
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

revoke all on function public.cleanup_idle_rooms() from public, anon;
grant execute on function public.cleanup_idle_rooms() to authenticated;
