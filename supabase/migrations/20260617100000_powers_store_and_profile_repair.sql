-- Powers store, profile self-heal, and admin/profile backfill.
--
-- 1. Adds a buyable catalog of Extreme powers with per-user ownership and an
--    atomic coin purchase, mirroring the cosmetics store.
-- 2. Makes update_player_profile upsert so a missing profile row self-heals.
-- 3. Backfills profile rows for any auth users missing one, and re-affirms the
--    developer account as an admin with every cosmetic and power.

-- ---------------------------------------------------------------------------
-- 1. Powers store
-- ---------------------------------------------------------------------------

create table public.power_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  price int not null default 0,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint power_items_price_nonnegative check (price >= 0)
);

create table public.power_ownership (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.power_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.power_items enable row level security;
alter table public.power_ownership enable row level security;

grant select on table public.power_items to authenticated;
grant select on table public.power_ownership to authenticated;

create policy power_items_select_all
  on public.power_items
  for select
  to authenticated
  using (true);

create policy power_ownership_select_own
  on public.power_ownership
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Seed the catalog. Shield and dash are free starters; the rest are unlockable.
insert into public.power_items (code, name, description, price, is_default, sort_order)
values
  ('shield', 'Shield', 'Block the next capture on one of your tokens.', 0, true, 0),
  ('dash', 'Dash', 'Your chosen token''s next move advances double.', 0, true, 1),
  ('warp', 'Warp', 'Jump one of your tokens to the next safe square ahead.', 200, false, 2),
  ('snipe', 'Snipe', 'Send an exposed enemy token home from range.', 350, false, 3),
  ('swap', 'Swap', 'Swap one of your tokens with an opponent''s token.', 350, false, 4);

-- Buy a power with coins. Atomic: checks price and balance, deducts, grants.
create function public.purchase_power(p_item_id uuid)
returns public.power_ownership
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_price int;
  v_is_default boolean;
  v_coins int;
  v_row public.power_ownership;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select price, is_default into v_price, v_is_default
  from public.power_items where id = p_item_id;
  if not found then
    raise exception 'power item does not exist' using errcode = 'P0002';
  end if;

  if v_is_default or exists (
    select 1 from public.power_ownership
    where user_id = v_uid and item_id = p_item_id
  ) then
    raise exception 'you already own that power' using errcode = '23505';
  end if;

  select coins into v_coins from public.profiles where id = v_uid;
  if v_coins < v_price then
    raise exception 'not enough coins' using errcode = '23514';
  end if;

  update public.profiles set coins = coins - v_price where id = v_uid;
  insert into public.power_ownership (user_id, item_id)
  values (v_uid, p_item_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- The full power catalog with an owned flag, for the store.
create function public.list_power_store()
returns table (
  id uuid,
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
  select i.id, i.code, i.name, i.description, i.price, i.is_default,
    (i.is_default or o.user_id is not null)
  from public.power_items i
  left join public.power_ownership o
    on o.item_id = i.id and o.user_id = (select auth.uid())
  order by i.price, i.sort_order, i.name;
$$;

revoke all on function public.purchase_power(uuid) from public, anon;
revoke all on function public.list_power_store() from public, anon;
grant execute on function public.purchase_power(uuid) to authenticated;
grant execute on function public.list_power_store() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profile self-heal: upsert instead of update-only.
-- ---------------------------------------------------------------------------

create or replace function public.update_player_profile(
  p_display_name text,
  p_username text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_display_name text := nullif(trim(p_display_name), '');
  v_username text := lower(nullif(trim(p_username), ''));
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if v_display_name is null or char_length(v_display_name) > 40 then
    raise exception 'display name must be between 1 and 40 characters'
      using errcode = '23514';
  end if;

  if v_username is not null and (
    char_length(v_username) not between 3 and 24
    or v_username !~ '^[a-z0-9_]+$'
  ) then
    raise exception 'username must be 3-24 characters using only letters, numbers, or underscores'
      using errcode = '23514';
  end if;

  insert into public.profiles (id, display_name, username)
  values (v_uid, v_display_name, v_username)
  on conflict (id) do update
    set display_name = excluded.display_name,
        username = excluded.username
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_player_profile(text, text)
  from public, anon;
grant execute on function public.update_player_profile(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill missing profiles and re-affirm the developer account.
-- ---------------------------------------------------------------------------

insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(split_part(u.email, '@', 1), 'Player'), 40)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

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
    insert into public.power_ownership (user_id, item_id)
    select v_id, id from public.power_items
    on conflict do nothing;
  end if;
end $$;
