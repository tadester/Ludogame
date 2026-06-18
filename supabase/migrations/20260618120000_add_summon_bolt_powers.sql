-- Add the Summon and Bolt powers to the buyable powers catalog.

insert into public.power_items (code, name, description, price, is_default, sort_order)
values
  ('summon', 'Summon', 'Release a token from the yard without rolling a six.', 250, false, 5),
  ('bolt', 'Bolt', 'Knock an exposed enemy token back six squares.', 300, false, 6)
on conflict (code) do nothing;

-- Grant the developer account the new powers too.
do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = 'obasantade@gmail.com';
  if v_id is not null then
    insert into public.power_ownership (user_id, item_id)
    select v_id, id from public.power_items
    on conflict do nothing;
  end if;
end $$;
