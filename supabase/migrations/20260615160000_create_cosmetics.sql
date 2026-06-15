-- Cosmetics: a catalog of visual items, per-user ownership of non-default
-- items, and each player's equipped loadout plus accessibility preferences.
-- Cosmetics are purely presentational and never affect gameplay. Equipping is
-- validated atomically (you must own the item) via a security-definer function;
-- the tables stay select-only for clients.

create type public.cosmetic_kind as enum (
  'background', 'board', 'dice', 'token', 'animation', 'sound', 'effect'
);

create table public.cosmetic_items (
  id uuid primary key default gen_random_uuid(),
  kind public.cosmetic_kind not null,
  code text not null,
  name text not null,
  description text not null default '',
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint cosmetic_items_code_format check (code ~ '^[a-z0-9_]+$'),
  constraint cosmetic_items_kind_code_unique unique (kind, code)
);

-- At most one default per kind keeps the seeded loadout unambiguous.
create unique index cosmetic_items_one_default_per_kind
  on public.cosmetic_items (kind)
  where is_default;

create table public.cosmetic_ownership (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.cosmetic_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.player_cosmetics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  background_item_id uuid references public.cosmetic_items(id) on delete set null,
  board_item_id uuid references public.cosmetic_items(id) on delete set null,
  dice_item_id uuid references public.cosmetic_items(id) on delete set null,
  token_item_id uuid references public.cosmetic_items(id) on delete set null,
  animation_item_id uuid references public.cosmetic_items(id) on delete set null,
  sound_item_id uuid references public.cosmetic_items(id) on delete set null,
  effect_item_id uuid references public.cosmetic_items(id) on delete set null,
  reduced_motion boolean not null default false,
  muted_audio boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.cosmetic_items enable row level security;
alter table public.cosmetic_items force row level security;
alter table public.cosmetic_ownership enable row level security;
alter table public.cosmetic_ownership force row level security;
alter table public.player_cosmetics enable row level security;
alter table public.player_cosmetics force row level security;

revoke all on table public.cosmetic_items from anon, authenticated;
revoke all on table public.cosmetic_ownership from anon, authenticated;
revoke all on table public.player_cosmetics from anon, authenticated;
grant select on table public.cosmetic_items to authenticated;
grant select on table public.cosmetic_ownership to authenticated;
grant select on table public.player_cosmetics to authenticated;

-- The catalog is readable by any signed-in user.
create policy cosmetic_items_select_all
  on public.cosmetic_items
  for select
  to authenticated
  using (true);

create policy cosmetic_ownership_select_own
  on public.cosmetic_ownership
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy player_cosmetics_select_own
  on public.player_cosmetics
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create trigger player_cosmetics_set_updated_at
before update on public.player_cosmetics
for each row execute function private.touch_updated_at();

-- Whether the caller may equip an item: it must be a default item or one they
-- own.
create function private.owns_cosmetic(p_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.cosmetic_items i
    where i.id = p_item_id
      and (
        i.is_default
        or exists (
          select 1 from public.cosmetic_ownership o
          where o.item_id = i.id and o.user_id = (select auth.uid())
        )
      )
  );
$$;

-- Ensure the caller has a loadout row, seeded with the default item per kind.
create function private.ensure_player_cosmetics(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_cosmetics (
    user_id,
    background_item_id, board_item_id, dice_item_id, token_item_id,
    animation_item_id, sound_item_id, effect_item_id
  )
  select
    p_uid,
    (select id from public.cosmetic_items where kind = 'background' and is_default),
    (select id from public.cosmetic_items where kind = 'board' and is_default),
    (select id from public.cosmetic_items where kind = 'dice' and is_default),
    (select id from public.cosmetic_items where kind = 'token' and is_default),
    (select id from public.cosmetic_items where kind = 'animation' and is_default),
    (select id from public.cosmetic_items where kind = 'sound' and is_default),
    (select id from public.cosmetic_items where kind = 'effect' and is_default)
  on conflict (user_id) do nothing;
end;
$$;

-- Equip an owned item into its slot.
create function public.equip_cosmetic(p_item_id uuid)
returns public.player_cosmetics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_kind public.cosmetic_kind;
  v_row public.player_cosmetics;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select kind into v_kind from public.cosmetic_items where id = p_item_id;
  if not found then
    raise exception 'cosmetic item does not exist' using errcode = 'P0002';
  end if;
  if not private.owns_cosmetic(p_item_id) then
    raise exception 'you do not own that item' using errcode = '42501';
  end if;

  perform private.ensure_player_cosmetics(v_uid);

  update public.player_cosmetics set
    background_item_id = case when v_kind = 'background' then p_item_id
      else background_item_id end,
    board_item_id = case when v_kind = 'board' then p_item_id
      else board_item_id end,
    dice_item_id = case when v_kind = 'dice' then p_item_id
      else dice_item_id end,
    token_item_id = case when v_kind = 'token' then p_item_id
      else token_item_id end,
    animation_item_id = case when v_kind = 'animation' then p_item_id
      else animation_item_id end,
    sound_item_id = case when v_kind = 'sound' then p_item_id
      else sound_item_id end,
    effect_item_id = case when v_kind = 'effect' then p_item_id
      else effect_item_id end
  where user_id = v_uid
  returning * into v_row;

  return v_row;
end;
$$;

-- Update the accessibility preferences.
create function public.update_cosmetic_preferences(
  p_reduced_motion boolean,
  p_muted_audio boolean
)
returns public.player_cosmetics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.player_cosmetics;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  perform private.ensure_player_cosmetics(v_uid);

  update public.player_cosmetics set
    reduced_motion = coalesce(p_reduced_motion, reduced_motion),
    muted_audio = coalesce(p_muted_audio, muted_audio)
  where user_id = v_uid
  returning * into v_row;

  return v_row;
end;
$$;

-- The caller's loadout and preferences, seeding defaults on first read.
create function public.get_player_cosmetics()
returns public.player_cosmetics
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.player_cosmetics;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.ensure_player_cosmetics(v_uid);
  select * into v_row from public.player_cosmetics where user_id = v_uid;
  return v_row;
end;
$$;

-- The catalog with an `owned` flag for the caller.
create function public.list_cosmetics()
returns table (
  id uuid,
  kind public.cosmetic_kind,
  code text,
  name text,
  description text,
  is_default boolean,
  sort_order int,
  owned boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    i.id, i.kind, i.code, i.name, i.description, i.is_default, i.sort_order,
    (i.is_default or o.user_id is not null) as owned
  from public.cosmetic_items i
  left join public.cosmetic_ownership o
    on o.item_id = i.id and o.user_id = (select auth.uid())
  order by i.kind, i.sort_order, i.name;
$$;

-- Grant ownership of a non-default item. Service role only (purchases/rewards).
create function public.grant_cosmetic(p_user_id uuid, p_item_id uuid)
returns public.cosmetic_ownership
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.cosmetic_ownership;
begin
  insert into public.cosmetic_ownership (user_id, item_id)
  values (p_user_id, p_item_id)
  on conflict (user_id, item_id) do update set acquired_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.equip_cosmetic(uuid) from public, anon;
revoke all on function public.update_cosmetic_preferences(boolean, boolean)
  from public, anon;
revoke all on function public.get_player_cosmetics() from public, anon;
revoke all on function public.list_cosmetics() from public, anon;
revoke all on function public.grant_cosmetic(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.equip_cosmetic(uuid) to authenticated;
grant execute on function public.update_cosmetic_preferences(boolean, boolean)
  to authenticated;
grant execute on function public.get_player_cosmetics() to authenticated;
grant execute on function public.list_cosmetics() to authenticated;
grant execute on function public.grant_cosmetic(uuid, uuid) to service_role;

-- Seed the starter catalog. One default per kind plus a few unlockables.
insert into public.cosmetic_items (kind, code, name, description, is_default, sort_order)
values
  ('background', 'midnight', 'Midnight', 'The default deep-blue table.', true, 0),
  ('background', 'aurora', 'Aurora', 'Soft northern-lights gradient.', false, 1),
  ('background', 'sunset', 'Sunset', 'Warm dusk gradient.', false, 2),
  ('board', 'classic', 'Classic Board', 'The standard cross board.', true, 0),
  ('board', 'emerald', 'Emerald Board', 'Green felt board skin.', false, 1),
  ('dice', 'ivory', 'Ivory Dice', 'Clean white dice.', true, 0),
  ('dice', 'onyx', 'Onyx Dice', 'Sleek black dice.', false, 1),
  ('token', 'classic', 'Classic Tokens', 'Standard rounded tokens.', true, 0),
  ('token', 'gem', 'Gem Tokens', 'Faceted gem tokens.', false, 1),
  ('animation', 'standard', 'Standard Motion', 'Default movement and capture animations.', true, 0),
  ('sound', 'standard', 'Standard Sounds', 'Default dice and move sounds.', true, 0),
  ('effect', 'none', 'No Effects', 'No extra visual effects.', true, 0),
  ('effect', 'confetti', 'Confetti', 'Celebrate wins with confetti.', false, 1);
