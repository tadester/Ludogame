-- Admin console helpers: resolve users by identifier, set roles, grant
-- cosmetics by code, mass-grant coins, and read server stats. All admin-gated.

create function public.admin_find_user(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  role public.app_role,
  coins int,
  banned boolean
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
    select p.id, p.username, p.display_name, p.role, p.coins, p.banned
    from public.profiles p
    where p_query <> ''
      and (
        p.id::text = p_query
        or lower(p.username) = lower(p_query)
        or p.display_name ilike '%' || p_query || '%'
      )
    order by (lower(coalesce(p.username, '')) = lower(p_query)) desc,
      p.display_name
    limit 10;
end;
$$;

create function public.admin_set_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

-- Grant every cosmetic matching a code (codes are unique per kind). Returns the
-- number of items newly granted.
create function public.admin_grant_cosmetic(p_user_id uuid, p_code text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.cosmetic_ownership (user_id, item_id)
  select p_user_id, id from public.cosmetic_items
  where lower(code) = lower(p_code)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Give coins to every player. Returns the number of players affected.
create function public.admin_grant_coins_all(p_amount int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles set coins = greatest(0, coins + p_amount);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.admin_stats()
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
      count(*) filter (where role = 'admin')::bigint,
      count(*) filter (where banned)::bigint,
      coalesce(sum(coins), 0)::bigint
    from public.profiles;
end;
$$;

revoke all on function public.admin_find_user(text) from public, anon;
revoke all on function public.admin_set_role(uuid, public.app_role)
  from public, anon;
revoke all on function public.admin_grant_cosmetic(uuid, text) from public, anon;
revoke all on function public.admin_grant_coins_all(int) from public, anon;
revoke all on function public.admin_stats() from public, anon;

grant execute on function public.admin_find_user(text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role)
  to authenticated;
grant execute on function public.admin_grant_cosmetic(uuid, text) to authenticated;
grant execute on function public.admin_grant_coins_all(int) to authenticated;
grant execute on function public.admin_stats() to authenticated;
