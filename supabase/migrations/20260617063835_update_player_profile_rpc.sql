create function public.update_player_profile(
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

  update public.profiles
    set display_name = v_display_name,
        username = v_username
    where id = v_uid
    returning * into v_row;

  if not found then
    raise exception 'profile does not exist' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_player_profile(text, text)
  from public, anon;
grant execute on function public.update_player_profile(text, text)
  to authenticated;
