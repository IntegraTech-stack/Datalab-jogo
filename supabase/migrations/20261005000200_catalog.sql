-- DataLab · 002 · catalog (read-only for players; filled by seed.sql)

create table if not exists public.rarities (
  id text primary key,
  name text not null,
  rank smallint not null unique,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table if not exists public.currencies (
  id text primary key,                 -- cash ($, company), gold (premium), credits (earned playing)
  name text not null,
  scope text not null check (scope in ('company', 'player')),
  premium boolean not null default false
);

create table if not exists public.shop_categories (
  id text primary key,
  name text not null,
  sort smallint not null default 0
);

create table if not exists public.events (
  id text primary key,
  name text not null,
  description text,
  color text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint events_window check (ends_at > starts_at)
);

-- everything the shop sells or the admin can grant (ids match assets/js/cosmetics.js)
create table if not exists public.items (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  category_id text not null references public.shop_categories (id),
  slot text,                           -- rack | server | switch | storage | rackacc | led | shirt | pants | hair | hat | shades | scarf | backpack | chain | palette | use | bot | null
  value jsonb,                         -- style key / colours, as in the client catalog
  name text not null,
  description text,
  rarity_id text not null references public.rarities (id),
  currency_id text not null default 'gold' references public.currencies (id),
  price integer not null default 0 check (price >= 0),
  stackable boolean not null default false,
  max_quantity integer check (max_quantity is null or max_quantity > 0),
  sellable boolean not null default true,
  purchasable boolean not null default true,
  gift boolean not null default false, -- free to claim during its event
  grant_type public.grant_type not null default 'shop',
  event_id text references public.events (id),
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint items_price_if_sold check (not purchasable or price > 0 or gift)
);
create index if not exists items_category_idx on public.items (category_id);
create index if not exists items_event_idx on public.items (event_id) where event_id is not null;

-- cosmetic skins (1:1 with an item): what they dress
create table if not exists public.skins (
  item_id text primary key references public.items (id) on delete cascade,
  target text not null check (target in ('rack', 'server', 'switch', 'storage', 'rackacc', 'led', 'character')),
  theme text
);

create table if not exists public.event_items (
  event_id text not null references public.events (id) on delete cascade,
  item_id text not null references public.items (id) on delete cascade,
  kind text not null default 'shop' check (kind in ('shop', 'gift')),
  primary key (event_id, item_id)
);

-- legendary bot templates (the shop item → the crew member it becomes)
create table if not exists public.legendary_bot_templates (
  item_id text primary key references public.items (id) on delete cascade,
  name text not null,
  role text not null,
  level smallint not null default 8 check (level between 1 and 10),
  profile jsonb not null default '{}'::jsonb
);

-- hardware models: servers, switches, patch panels, storage (prices in company $)
create table if not exists public.server_types (
  id text primary key,
  kind text not null check (kind in ('server', 'switch', 'patch', 'storage')),
  name text not null,
  price integer not null check (price >= 0),
  perf numeric(5, 2),
  specs jsonb not null default '{}'::jsonb
);

-- everything placeable in build mode, with its price (company $). The save function charges by this.
create table if not exists public.equipment_prices (
  id text primary key,
  kind text not null,
  unit_kind text check (unit_kind in ('server', 'switch', 'patch')), -- rack units
  category text,
  name text not null,
  price integer not null check (price >= 0)
);

create table if not exists public.achievements (
  id text primary key,
  name text not null,
  description text,
  reward jsonb not null default '{}'::jsonb  -- e.g. {"gold": 5}
);

-- tunables the server uses (prices, caps, salaries). Readable by everyone, writable by nobody.
create table if not exists public.game_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
