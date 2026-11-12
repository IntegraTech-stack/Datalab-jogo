-- DataLab · 001 · core: schemas, enums, helpers, profiles, roles, wallets, inventories
-- Run order: 0100 core → 0200 catalog → 0300 inventory → 0400 game → 0500 security → 0600 functions → seed.sql
--
-- Design:
-- * public: tables the browser may READ under RLS (each player only their own rows) + the catalog.
--   The browser never writes money, items, saves or roles: there are no INSERT/UPDATE/DELETE grants
--   for anon/authenticated on those tables (only profiles: username, display_name, avatar).
-- * private: business logic (purchases, saves, economy, grants). Not exposed by the Data API; only the
--   Edge Functions reach it, through a direct database connection (SUPABASE_DB_URL), after
--   validating the user's JWT and role.

create schema if not exists private;
revoke all on schema private from public;
-- anon / authenticated exist in every Supabase project
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema private from authenticated'; end if;
end $$;

-- functions created in public are NOT executable by everyone unless granted explicitly
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'developer', 'moderator');
exception when duplicate_object then null; end $$;

do $$ begin
  -- where an item (or currency) came from
  create type public.grant_type as enum ('shop', 'event', 'founder', 'developer', 'beta', 'compensation', 'special', 'achievement', 'reward', 'starter', 'migration');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: one per auth user (created by the signup trigger in 0600)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  -- the player's character (same fields as the in-game editor). Shop cosmetics inside it are
  -- checked against the inventory by a trigger (0500).
  avatar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 32),
  constraint profiles_avatar_object check (jsonb_typeof(avatar) = 'object' and pg_column_size(avatar) < 4096)
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();

-- staff roles (admin, developer, moderator). Never writable from the browser.
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function private.has_role(p_uid uuid, p_roles public.app_role[])
returns boolean language sql stable as $$
  select exists (select 1 from public.user_roles where user_id = p_uid and role = any (p_roles));
$$;

-- the player's own balances (separate from any company's cash)
create table if not exists public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  gold bigint not null default 0 check (gold >= 0),
  credits bigint not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

-- one inventory per player (the items live in inventory_items, 0300)
create table if not exists public.inventories (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  capacity integer not null default 1000 check (capacity between 1 and 100000),
  created_at timestamptz not null default now()
);

-- is a username free? (callable before signup; reveals only availability)
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;
