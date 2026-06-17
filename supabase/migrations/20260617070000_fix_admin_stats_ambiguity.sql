-- Qualify profile columns so PL/pgSQL output variables cannot shadow them.

create or replace function public.admin_stats()
returns table (
  total_users bigint,
  admins bigint,
  banned bigint,
  total_coins bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select
      count(*)::bigint,
      count(*) filter (where p.role = 'admin')::bigint,
      count(*) filter (where p.banned)::bigint,
      coalesce(sum(p.coins), 0)::bigint
    from public.profiles p;
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
