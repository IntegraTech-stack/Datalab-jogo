-- DataLab · 007 · account bootstrap: everything a new player needs is created by the server at signup
--   profile + wallet (welcome Gold) + inventory  (0600)
--   + player_progress (the account's progress)
--   + a company with its datacenter, terrain and save slot 1 (empty: the first "Novo jogo" fills it)

create table if not exists public.player_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  level integer not null default 1 check (level between 1 and 100),
  xp bigint not null default 0 check (xp >= 0),
  datacenters_completed integer not null default 0 check (datacenters_completed >= 0),
  total_play_minutes bigint not null default 0 check (total_play_minutes >= 0),
  tutorial_done boolean not null default false,
  last_slot smallint check (last_slot between 1 and 3),
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_progress enable row level security;
drop policy if exists player_progress_own on public.player_progress;
create policy player_progress_own on public.player_progress for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.player_progress from anon, authenticated;
    grant select on public.player_progress to authenticated;
  end if;
end $$;
drop trigger if exists player_progress_touch on public.player_progress;
create trigger player_progress_touch before update on public.player_progress for each row execute function private.touch_updated_at();

-- signup: profile, wallet, inventory, progress and the first company (all or nothing)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'jogador'), '[^a-zA-Z0-9_]', '', 'g'));
  uname text;
  n integer := 0;
  welcome bigint := coalesce((select (value ->> 'welcome_gold')::bigint from public.game_config where key = 'economy'), 100);
  company text := left(trim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'company_name', ''), '[[:cntrl:]<>]', '', 'g')), 40);
begin
  base := left(base, 16);
  if char_length(base) < 3 then base := 'jogador'; end if;
  uname := base;
  while exists (select 1 from public.profiles where lower(username) = uname) loop
    n := n + 1;
    uname := left(base, 15) || n::text;
  end loop;
  insert into public.profiles (id, username, display_name) values (new.id, uname, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), uname), 32));
  insert into public.wallets (user_id, gold) values (new.id, welcome);
  insert into public.inventories (user_id) values (new.id);
  insert into public.player_progress (user_id) values (new.id);
  insert into public.transactions (user_id, currency_id, amount, balance_after, kind, description) values (new.id, 'gold', welcome, welcome, 'welcome', 'Boas-vindas · moeda dourada');
  perform private.game_new(new.id, 1, coalesce(nullif(company, ''), 'Minha empresa'), 'zero');
  return new;
end $$;

-- progress follows the saves and the achievements
create or replace function private.progress_from_save() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.version > coalesce(old.version, 0) then
    update public.player_progress set last_slot = new.slot, last_played_at = now(),
      total_play_minutes = total_play_minutes + greatest(0, new.play_minutes - coalesce(old.play_minutes, 0))
    where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists game_saves_progress on public.game_saves;
create trigger game_saves_progress after update on public.game_saves for each row execute function private.progress_from_save();

create or replace function private.progress_from_achievement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.achievement_id = 'first_datacenter' then
    update public.player_progress set datacenters_completed = datacenters_completed + 1 where user_id = new.user_id;
  end if;
  update public.player_progress set xp = xp + 50, level = least(100, 1 + (xp + 50) / 500) where user_id = new.user_id;
  return new;
end $$;
drop trigger if exists user_achievements_progress on public.user_achievements;
create trigger user_achievements_progress after insert on public.user_achievements for each row execute function private.progress_from_achievement();

-- accounts created before this migration get the same starting state
insert into public.player_progress (user_id) select id from public.profiles on conflict do nothing;
do $$ declare p record; begin
  for p in select id from public.profiles pr where not exists (select 1 from public.game_saves s where s.user_id = pr.id) loop
    perform private.game_new(p.id, 1, 'Minha empresa', 'zero');
  end loop;
end $$;

-- the new functions are for the database only
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon, authenticated', f.sig); end if;
  end loop;
end $$;
