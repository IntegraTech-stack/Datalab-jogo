-- DataLab · 003 · inventory, equipped items, legendary bots, grants, achievements, rate limits

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.inventories (user_id) on delete cascade,
  item_id text not null references public.items (id),
  quantity integer not null check (quantity > 0 and quantity <= 100000),
  source public.grant_type not null default 'shop',
  event_id text references public.events (id),
  first_acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_unique unique (user_id, item_id)
);
create index if not exists inventory_items_user_idx on public.inventory_items (user_id);

-- one equipped item per slot; the FK to the owned row removes the equip when the item leaves
create table if not exists public.equipped_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot text not null,
  item_id text not null references public.items (id),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  equipped_at timestamptz not null default now(),
  primary key (user_id, slot)
);
create index if not exists equipped_items_inv_idx on public.equipped_items (inventory_item_id);

-- every legendary bot the player owns, one row per bot (the inventory keeps the count)
create table if not exists public.legendary_bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.items (id),
  name text not null check (char_length(name) between 1 and 32),
  level smallint not null default 8 check (level between 1 and 10),
  xp integer not null default 0 check (xp >= 0),
  skills jsonb not null default '{}'::jsonb,
  status text not null default 'stored' check (status in ('stored', 'active')),
  employee_id uuid,                          -- FK added in 0400 (employees)
  source public.grant_type not null default 'shop',
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists legendary_bots_user_idx on public.legendary_bots (user_id);

-- audit of everything granted by staff or by the system (who, to whom, what, how many, why, when)
create table if not exists public.item_grants (
  id bigint generated always as identity primary key,
  granted_by uuid references public.profiles (id) on delete set null, -- null = the system (event gift…)
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text references public.items (id),
  currency_id text references public.currencies (id),
  quantity integer not null check (quantity > 0),
  grant_type public.grant_type not null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  constraint item_grants_one_target check ((item_id is null) <> (currency_id is null))
);
create index if not exists item_grants_user_idx on public.item_grants (user_id, created_at desc);
create index if not exists item_grants_by_idx on public.item_grants (granted_by, created_at desc);

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- per-user request throttling for the Edge Functions (private: never exposed)
create table if not exists private.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket)
);
