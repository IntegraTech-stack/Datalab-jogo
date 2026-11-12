-- DataLab · 005 · security: RLS on every table, least-privilege grants
--
-- Rules:
-- 1. RLS is ON for every table in public (catalog included).
-- 2. Players SELECT only their own rows (user_id = auth.uid()); the catalog is public read-only.
-- 3. No INSERT/UPDATE/DELETE grants for anon/authenticated anywhere, except profiles
--    (username, display_name, avatar of the player's own row). Money, items, saves, roles and grants
--    only change through private.* functions, which the Edge Functions call after validating the user.

do $$
declare
  t text;
  catalog text[] := array['rarities', 'currencies', 'shop_categories', 'events', 'items', 'skins', 'event_items',
                          'legendary_bot_templates', 'server_types', 'equipment_prices', 'achievements', 'game_config'];
  own text[] := array['wallets', 'inventories', 'inventory_items', 'equipped_items', 'legendary_bots', 'item_grants',
                      'user_achievements', 'user_roles', 'companies', 'datacenters', 'game_saves', 'terrain', 'buildings',
                      'rooms', 'furniture', 'employees', 'salaries', 'servers', 'virtual_machines', 'incidents', 'finances',
                      'transactions'];
  has_roles boolean := exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon');
begin
  -- every table: RLS on (forced for the owner too, except the service role bypass that Supabase keeps)
  foreach t in array catalog || own || array['profiles', 'bot_skills', 'bot_schedules'] loop
    execute format('alter table public.%I enable row level security', t);
    if has_roles then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;

  foreach t in array catalog loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    if has_roles then execute format('grant select on public.%I to anon, authenticated', t); end if;
  end loop;

  foreach t in array own loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_own', t);
    if has_roles then execute format('grant select on public.%I to authenticated', t); end if;
  end loop;
end $$;

-- employees' children: visible through the parent employee
drop policy if exists bot_skills_own on public.bot_skills;
create policy bot_skills_own on public.bot_skills for select to authenticated
  using (exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid())));
drop policy if exists bot_schedules_own on public.bot_schedules;
create policy bot_schedules_own on public.bot_schedules for select to authenticated
  using (exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid())));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.bot_skills, public.bot_schedules to authenticated;
  end if;
end $$;

-- profiles: read and edit only your own; only these columns can be changed by the player
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.profiles to authenticated;
    grant update (username, display_name, avatar) on public.profiles to authenticated;
    grant execute on function public.username_available(text) to anon, authenticated;
  end if;
end $$;

-- The avatar may only wear shop cosmetics the player owns: anything else is reset to the free default.
create or replace function private.sanitize_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := coalesce(new.avatar, '{}'::jsonb);
  k text;
  slot_of jsonb := '{"outfit":"shirt","pantsStyle":"pants","hairStyle":"hair","hat":"hat"}';
  dflt jsonb := '{"outfit":"tee","pantsStyle":"","hairStyle":"short","hat":""}';
  owned boolean;
begin
  if jsonb_typeof(a) <> 'object' then a := '{}'::jsonb; end if;
  -- valued slots (shirt model, pants, hair, hat)
  for k in select jsonb_object_keys(slot_of) loop
    if a ? k and exists (select 1 from public.items i where i.slot = slot_of ->> k and i.value = a -> k) then
      select exists (
        select 1 from public.items i join public.inventory_items v on v.item_id = i.id and v.user_id = new.id
        where i.slot = slot_of ->> k and i.value = a -> k and (k <> 'hat' or coalesce(i.color, '') = coalesce(a ->> 'hatColor', ''))
      ) into owned;
      if not owned then a := a || jsonb_build_object(k, dflt -> k); if k = 'hat' then a := a - 'hatColor'; end if; end if;
    end if;
  end loop;
  -- hat colours only come with an owned coloured hat
  if a ? 'hatColor' and not exists (
    select 1 from public.items i join public.inventory_items v on v.item_id = i.id and v.user_id = new.id
    where i.slot = 'hat' and i.color = a ->> 'hatColor') then a := a - 'hatColor'; end if;
  -- flag accessories
  foreach k in array array['shades', 'scarf', 'backpack', 'chain'] loop
    if coalesce((a ->> k)::boolean, false) and not exists (
      select 1 from public.items i join public.inventory_items v on v.item_id = i.id and v.user_id = new.id where i.slot = k) then
      a := a || jsonb_build_object(k, false);
    end if;
  end loop;
  -- legendary-only look pieces never belong to a player avatar
  a := a - 'visor' - 'legend';
  new.avatar := a;
  return new;
end $$;
drop trigger if exists profiles_sanitize_avatar on public.profiles;
create trigger profiles_sanitize_avatar before insert or update of avatar on public.profiles
  for each row execute function private.sanitize_avatar();

-- staff can never be created or changed through the API: user_roles has no write grants (above).
-- Changing roles: SQL editor (first admin) or the admin Edge Function (private.set_role, admins only).
