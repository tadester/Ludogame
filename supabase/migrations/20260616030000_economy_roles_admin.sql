-- Economy, roles, and moderation.
-- Adds a coin balance, an admin role, and a ban flag to profiles; a price to
-- cosmetics; an atomic coin purchase; and admin-only moderation functions.
-- Bootstraps a configured developer email as an admin with every cosmetic.

create type public.app_role as enum ('player', 'admin');

alter table public.profiles
  add column role public.app_role not null default 'player',
  add column coins int not null default 200,
  add column banned boolean not null default false,
  add constraint profiles_coins_nonnegative check (coins >= 0);

alter table public.cosmetic_items
  add column price int not null default 0,
  add constraint cosmetic_items_price_nonnegative check (price >= 0);

-- Price the unlockable catalog (defaults stay free at 0).
update public.cosmetic_items set price = 150 where not is_default;
update public.cosmetic_items set price = 300
  where code in ('night_city', 'celestial', 'neon_grid', 'crystal',
                 'shonen_gold', 'dynamic', 'sparkle');

-- Admin check for moderation functions.
create function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Replace the new-user handler to set the economy defaults and bootstrap the
-- developer account (admin role, a large coin balance, and all cosmetics).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
  requested_username text;
  v_is_dev boolean := lower(new.email) = 'obasantade@gmail.com';
  v_role public.app_role := case when v_is_dev then 'admin' else 'player' end;
  v_coins int := case when v_is_dev then 1000000 else 200 end;
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

  insert into public.profiles (id, username, display_name, role, coins)
  values (new.id, requested_username, requested_display_name, v_role, v_coins);

  if v_is_dev then
    insert into public.cosmetic_ownership (user_id, item_id)
    select new.id, id from public.cosmetic_items
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Backfill: if the developer already signed up, elevate and grant everything.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = 'obasantade@gmail.com';
  if v_id is not null then
    update public.profiles
      set role = 'admin', coins = greatest(coins, 1000000), banned = false
      where id = v_id;
    insert into public.cosmetic_ownership (user_id, item_id)
    select v_id, id from public.cosmetic_items
    on conflict do nothing;
  end if;
end $$;

-- Buy a cosmetic with coins. Atomic: checks price and balance, deducts, grants.
create function public.purchase_cosmetic(p_item_id uuid)
returns public.cosmetic_ownership
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_price int;
  v_is_default boolean;
  v_coins int;
  v_row public.cosmetic_ownership;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select price, is_default into v_price, v_is_default
  from public.cosmetic_items where id = p_item_id;
  if not found then
    raise exception 'cosmetic item does not exist' using errcode = 'P0002';
  end if;

  if v_is_default or exists (
    select 1 from public.cosmetic_ownership
    where user_id = v_uid and item_id = p_item_id
  ) then
    raise exception 'you already own that item' using errcode = '23505';
  end if;

  select coins into v_coins from public.profiles where id = v_uid;
  if v_coins < v_price then
    raise exception 'not enough coins' using errcode = '23514';
  end if;

  update public.profiles set coins = coins - v_price where id = v_uid;
  insert into public.cosmetic_ownership (user_id, item_id)
  values (v_uid, p_item_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- The full catalog with price and an owned flag, for the store.
create function public.list_store_items()
returns table (
  id uuid,
  kind public.cosmetic_kind,
  code text,
  name text,
  description text,
  price int,
  is_default boolean,
  owned boolean
)
language sql
security definer
set search_path = ''
as $$
  select i.id, i.kind, i.code, i.name, i.description, i.price, i.is_default,
    (i.is_default or o.user_id is not null)
  from public.cosmetic_items i
  left join public.cosmetic_ownership o
    on o.item_id = i.id and o.user_id = (select auth.uid())
  order by i.kind, i.price, i.sort_order, i.name;
$$;

-- The caller's wallet and account standing.
create function public.get_player_wallet()
returns table (coins int, role public.app_role, banned boolean)
language sql
security definer
set search_path = ''
as $$
  select coins, role, banned from public.profiles
  where id = (select auth.uid());
$$;

-- Admin: list all users for moderation.
create function public.admin_list_users()
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
    order by p.display_name;
end;
$$;

-- Admin: ban or unban a user (admins cannot be banned).
create function public.admin_set_ban(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_banned and exists (
    select 1 from public.profiles where id = p_user_id and role = 'admin'
  ) then
    raise exception 'cannot ban an admin' using errcode = '42501';
  end if;
  update public.profiles set banned = p_banned where id = p_user_id;
end;
$$;

-- Admin: adjust a user's coin balance (positive grants, negative deducts).
create function public.admin_grant_coins(p_user_id uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.profiles
    set coins = greatest(0, coins + p_amount)
    where id = p_user_id;
end;
$$;

revoke all on function public.purchase_cosmetic(uuid) from public, anon;
revoke all on function public.list_store_items() from public, anon;
revoke all on function public.get_player_wallet() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_ban(uuid, boolean) from public, anon;
revoke all on function public.admin_grant_coins(uuid, int) from public, anon;

grant execute on function public.purchase_cosmetic(uuid) to authenticated;
grant execute on function public.list_store_items() to authenticated;
grant execute on function public.get_player_wallet() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.admin_grant_coins(uuid, int) to authenticated;
