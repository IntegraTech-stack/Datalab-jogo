-- DataLab · 004 · game state: companies, datacenters, saves, terrain, rooms, furniture, crew,
-- servers, VMs, incidents, finances and the transaction ledger.
-- game_saves.data keeps the full snapshot the client restores; the other tables are the
-- server-side projection of it (validated and priced by private.save_game).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Meu datacenter' check (char_length(name) between 1 and 40),
  cash bigint not null default 0,
  phase text not null default 'setup' check (phase in ('setup', 'live')),
  month integer not null default 1 check (month >= 1),
  starter_kit jsonb not null default '{}'::jsonb,
  first_contract boolean not null default false,
  dc_rewarded boolean not null default false,
  last_settled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_cash_floor check (cash > -10000000)
);
create index if not exists companies_user_idx on public.companies (user_id);

create table if not exists public.datacenters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null unique references public.companies (id) on delete cascade,
  name text not null default 'DC-01' check (char_length(name) between 1 and 40),
  preset text not null default 'zero',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists datacenters_user_idx on public.datacenters (user_id);

create table if not exists public.game_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  name text not null default 'Meu datacenter' check (char_length(name) between 1 and 40),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  datacenter_id uuid not null unique references public.datacenters (id) on delete cascade,
  version integer not null default 0,
  data jsonb,                                    -- the snapshot (sanitized by the server)
  baseline jsonb not null default '{}'::jsonb,   -- what the preset brings for free (first save only)
  stats jsonb not null default '{}'::jsonb,
  play_minutes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_saves_slot unique (user_id, slot),
  constraint game_saves_size check (data is null or pg_column_size(data) < 3000000)
);

create table if not exists public.terrain (
  datacenter_id uuid primary key references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  width smallint not null check (width between 6 and 64),
  height smallint not null check (height between 6 and 48),
  expansions integer not null default 0 check (expansions >= 0),
  land_paid bigint not null default 0 check (land_paid >= 0),
  updated_at timestamptz not null default now()
);

-- floor areas (the "buildings" drawn with Nova sala / the lot's rectangles)
create table if not exists public.buildings (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  area_key text not null,
  name text,
  x smallint not null, y smallint not null, w smallint not null check (w between 1 and 64), h smallint not null check (h between 1 and 48),
  floor text,
  unique (datacenter_id, area_key)
);

create table if not exists public.rooms (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  type text,
  theme text,
  style jsonb,
  x smallint, y smallint, w smallint, h smallint,
  tiles integer
);
create index if not exists rooms_dc_idx on public.rooms (datacenter_id);

create table if not exists public.furniture (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null,
  def_id text not null references public.equipment_prices (id),
  kind text not null,
  tx smallint not null, ty smallint not null, rot smallint not null default 0 check (rot between 0 and 3),
  skin_item_id text references public.items (id),
  paid integer not null default 0 check (paid >= 0),
  data jsonb not null default '{}'::jsonb,
  unique (datacenter_id, item_key)
);
create index if not exists furniture_def_idx on public.furniture (datacenter_id, def_id);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emp_key integer not null,
  name text not null check (char_length(name) between 1 and 32),
  role text not null check (char_length(role) between 1 and 40),
  is_legendary boolean not null default false,
  legendary_bot_id uuid unique references public.legendary_bots (id) on delete set null,
  level smallint not null default 1 check (level between 1 and 10),
  xp integer not null default 0 check (xp >= 0),
  pay_factor numeric(4, 2) not null default 1 check (pay_factor between 0.92 and 1.08),
  profile jsonb not null default '{}'::jsonb,
  hired_at timestamptz not null default now(),
  unique (datacenter_id, emp_key)
);
create index if not exists employees_user_idx on public.employees (user_id);
do $$ begin
  alter table public.legendary_bots add constraint legendary_bots_employee_fk foreign key (employee_id) references public.employees (id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.bot_skills (
  employee_id uuid not null references public.employees (id) on delete cascade,
  skill text not null check (skill in ('redes', 'servidores', 'sistemas', 'seguranca', 'gestao')),
  value numeric(4, 1) not null check (value between 0 and 99),
  primary key (employee_id, skill)
);

create table if not exists public.bot_schedules (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  shift_id text not null default 'integral',
  start_hour smallint not null default 0 check (start_hour between 0 and 24),
  end_hour smallint not null default 24 check (end_hour between 0 and 24),
  oncall text[] not null default '{}'
);

-- salary history: the server computes it (role base × level × negotiated factor)
create table if not exists public.salaries (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  monthly integer not null check (monthly >= 0),
  reason text not null default 'hire',
  created_at timestamptz not null default now()
);
create index if not exists salaries_employee_idx on public.salaries (employee_id, created_at desc);

-- rack units (servers, switches, patch panels) and their state
create table if not exists public.servers (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key text not null,
  rack_key text not null,
  slot smallint not null check (slot between 0 and 8),
  kind text not null check (kind in ('server', 'switch', 'patch')),
  server_type_id text not null references public.equipment_prices (id),
  name text,
  ip text,
  state text not null default 'new' check (state in ('new', 'link', 'online')),
  specialization text,
  paid integer not null default 0 check (paid >= 0),
  installed_at timestamptz not null default now(),
  unique (datacenter_id, device_key)
);

create table if not exists public.virtual_machines (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vm_key integer not null,
  node_key text not null,
  name text not null check (name ~ '^[a-z0-9.-]{1,24}$'),
  os text,
  specialization text,
  vcpu smallint not null check (vcpu between 1 and 256),
  ram_gb integer not null check (ram_gb between 1 and 4096),
  disk_gb integer not null check (disk_gb between 8 and 100000),
  status text not null check (status in ('running', 'stopped')),
  unique (datacenter_id, vm_key)
);

create table if not exists public.incidents (
  id bigint generated always as identity primary key,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key text,
  type text not null check (char_length(type) <= 24),
  opened_minutes integer,
  resolved_at timestamptz not null default now(),
  resolved_by text check (resolved_by in ('player', 'crew')),
  loss integer not null default 0 check (loss >= 0)
);
create index if not exists incidents_dc_idx on public.incidents (datacenter_id, resolved_at desc);

-- the company's books per month (accumulated by every settle)
create table if not exists public.finances (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  month integer not null,
  income bigint not null default 0,
  costs bigint not null default 0,
  purchases bigint not null default 0,
  hires bigint not null default 0,
  land bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, month)
);

-- append-only ledger of everything that moves money, credits, gold or items
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  currency_id text references public.currencies (id),
  item_id text references public.items (id),
  amount bigint not null,                        -- signed: + gained, − spent (items: quantity)
  balance_after bigint,
  kind text not null check (kind in ('welcome', 'new_game', 'purchase', 'sell', 'exchange', 'consume', 'claim', 'grant',
    'revenue', 'opex', 'equipment', 'refund', 'hire', 'land', 'reward', 'achievement', 'adjust')),
  description text,
  ref jsonb,
  request_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transactions_target check (currency_id is not null or item_id is not null)
);
create index if not exists transactions_user_idx on public.transactions (user_id, created_at desc);
-- the same request (client-generated id) is processed only once
create unique index if not exists transactions_request_key on public.transactions (user_id, request_id) where request_id is not null;

-- timestamps
do $$ declare t text; begin
  foreach t in array array['companies', 'datacenters', 'game_saves', 'terrain', 'inventory_items', 'legendary_bots', 'finances', 'wallets'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;
