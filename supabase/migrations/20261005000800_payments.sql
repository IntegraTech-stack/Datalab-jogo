-- DataLab · 008 · real Gold purchases (AbacatePay)
-- Flow: the player asks for a pack → the Edge Function "payments" opens an order here and a checkout
-- at AbacatePay (externalId = order id) → the player pays on AbacatePay's page → the webhook (or the
-- game polling "status") asks AbacatePay for that checkout and, only when it says PAID for at least
-- the pack's price, private.payment_settle credits the Gold. Settling is idempotent: an order pays once.

-- packs on sale: price and coins live here (the server's truth), not in the browser
create table if not exists public.gold_packs (
  sku text primary key check (sku ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  coins integer not null check (coins > 0),
  price_cents integer not null check (price_cents > 0),
  tag text,
  sort smallint not null default 0,
  active boolean not null default true,
  -- AbacatePay product (prod_…); empty = found / created by externalId = sku on the first checkout
  provider_product_id text
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sku text not null references public.gold_packs (sku),
  coins integer not null check (coins > 0),
  price_cents integer not null check (price_cents > 0),
  provider text not null default 'abacatepay',
  checkout_id text unique,
  checkout_url text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded', 'failed')),
  paid_amount integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

drop trigger if exists payment_orders_touch on public.payment_orders;
create trigger payment_orders_touch before update on public.payment_orders for each row execute function private.touch_updated_at();

-- the ledger gets a kind for real-money purchases (and their refunds)
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('welcome', 'new_game', 'purchase', 'sell', 'exchange', 'consume', 'claim', 'grant',
  'revenue', 'opex', 'equipment', 'refund', 'hire', 'land', 'reward', 'achievement', 'adjust', 'payment'));

-- RLS: packs are public catalog; orders are read-only for their owner (writes only through private.*)
alter table public.gold_packs enable row level security;
alter table public.payment_orders enable row level security;
drop policy if exists gold_packs_read on public.gold_packs;
create policy gold_packs_read on public.gold_packs for select to anon, authenticated using (active);
drop policy if exists payment_orders_own on public.payment_orders;
create policy payment_orders_own on public.payment_orders for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.gold_packs, public.payment_orders from anon, authenticated;
    grant select on public.gold_packs to anon, authenticated;
    grant select on public.payment_orders to authenticated;
  end if;
end $$;

-- 100 Gold for R$ 4,00 (AbacatePay product "100 moedas")
insert into public.gold_packs (sku, name, coins, price_cents, sort) values ('gold_100', '100 Gold', 100, 400, 1)
on conflict (sku) do update set name = excluded.name, coins = excluded.coins, price_cents = excluded.price_cents;

-- ---------------------------------------------------------------------------
-- a new order (the checkout is attached right after, by the Edge Function)
-- ---------------------------------------------------------------------------
create or replace function private.payment_order_new(p_uid uuid, p_sku text) returns jsonb
language plpgsql as $$
declare pk public.gold_packs; o public.payment_orders;
begin
  perform private.lock_player(p_uid);
  select * into pk from public.gold_packs where sku = p_sku and active;
  if not found then perform private.fail('pack_not_found', 'Pacote indisponível.'); end if;
  if (select count(*) from public.payment_orders where user_id = p_uid and status = 'pending' and created_at > now() - interval '1 hour') >= 10 then
    perform private.fail('rate_limited', 'Muitos pedidos abertos: conclua ou espere um pouco.');
  end if;
  insert into public.payment_orders (user_id, sku, coins, price_cents) values (p_uid, pk.sku, pk.coins, pk.price_cents) returning * into o;
  return jsonb_build_object('order_id', o.id, 'sku', pk.sku, 'name', pk.name, 'coins', pk.coins, 'price_cents', pk.price_cents, 'product_id', pk.provider_product_id);
end $$;

create or replace function private.payment_order_attach(p_order uuid, p_checkout text, p_url text) returns void
language sql as $$
  update public.payment_orders set checkout_id = p_checkout, checkout_url = p_url where id = p_order and checkout_id is null;
$$;

create or replace function private.payment_order_fail(p_order uuid) returns void
language sql as $$
  update public.payment_orders set status = 'failed' where id = p_order and status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- settle an order with what AbacatePay says about its checkout
-- p_status: PENDING | PAID | EXPIRED | CANCELLED | REFUNDED · p_amount: cents paid (or charged)
-- ---------------------------------------------------------------------------
create or replace function private.payment_settle(p_order uuid, p_status text, p_amount integer) returns jsonb
language plpgsql as $$
declare o public.payment_orders; w public.wallets; back bigint;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then perform private.fail('order_not_found', 'Pedido inexistente.'); end if;
  w := private.lock_player(o.user_id);

  if p_status = 'PAID' and o.status = 'pending' then
    if coalesce(p_amount, 0) < o.price_cents then
      -- never credit less than the pack's price (a changed product / partial amount)
      update public.payment_orders set status = 'failed', paid_amount = p_amount where id = o.id returning * into o;
      raise warning 'payment % paid % < price %', o.id, p_amount, o.price_cents;
    else
      update public.wallets set gold = gold + o.coins where user_id = o.user_id returning * into w;
      perform private.ledger(o.user_id, null, 'gold', null, o.coins, w.gold, 'payment', 'Compra · ' || o.coins || ' Gold (AbacatePay)',
        jsonb_build_object('order', o.id, 'checkout', o.checkout_id, 'amount', p_amount));
      update public.payment_orders set status = 'paid', paid_amount = p_amount, paid_at = now() where id = o.id returning * into o;
    end if;
  elsif p_status = 'REFUNDED' and o.status = 'paid' then
    -- take back what is still there (Gold already spent stays spent; the ledger keeps the trail)
    back := least(w.gold, o.coins);
    update public.wallets set gold = gold - back where user_id = o.user_id returning * into w;
    perform private.ledger(o.user_id, null, 'gold', null, -back, w.gold, 'payment', 'Estorno · ' || o.coins || ' Gold (AbacatePay)',
      jsonb_build_object('order', o.id, 'checkout', o.checkout_id, 'missing', o.coins - back));
    update public.payment_orders set status = 'refunded' where id = o.id returning * into o;
  elsif p_status in ('EXPIRED', 'CANCELLED') and o.status = 'pending' then
    update public.payment_orders set status = lower(p_status) where id = o.id returning * into o;
  end if;

  return jsonb_build_object('order_id', o.id, 'status', o.status, 'coins', o.coins, 'state', private.inventory_state(o.user_id));
end $$;
