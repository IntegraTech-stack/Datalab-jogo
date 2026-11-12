-- DataLab · 006 · server-side game logic (schema private, never exposed to the Data API)
-- Called only by the Edge Functions (direct DB connection), always with the user id taken from a
-- verified JWT. Every function that touches balances first locks the player's wallet row: that
-- serialises a player's requests, so double clicks / parallel requests cannot spend twice or
-- duplicate items. Errors are raised as  P0001 / message = machine code / hint = text for players.

alter table private.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- small helpers
-- ---------------------------------------------------------------------------
create or replace function private.cfg(p_key text) returns jsonb
language sql stable as $$ select value from public.game_config where key = p_key $$;

create or replace function private.econ(p_path text[]) returns jsonb
language sql stable as $$ select (select value from public.game_config where key = 'economy') #> p_path $$;

create or replace function private.fail(p_code text, p_hint text) returns void
language plpgsql as $$ begin raise exception using errcode = 'P0001', message = p_code, hint = p_hint; end $$;

create or replace function private.round50(p numeric) returns bigint
language sql immutable as $$ select (round(p / 50) * 50)::bigint $$;

create or replace function private.event_active(p_event text) returns boolean
language sql stable as $$ select exists (select 1 from public.events where id = p_event and now() between starts_at and ends_at) $$;

-- lock the player (wallet row) for the rest of the transaction
create or replace function private.lock_player(p_uid uuid) returns public.wallets
language plpgsql as $$
declare w public.wallets;
begin
  select * into w from public.wallets where user_id = p_uid for update;
  if not found then perform private.fail('no_account', 'Conta sem carteira: faça login novamente.'); end if;
  return w;
end $$;

-- a request id may be used once
create or replace function private.check_request(p_uid uuid, p_request uuid) returns void
language plpgsql as $$
begin
  if p_request is not null and exists (select 1 from public.transactions where user_id = p_uid and request_id = p_request) then
    perform private.fail('duplicate_request', 'Esta operação já foi processada.');
  end if;
end $$;

-- fixed-window throttling per user and bucket
create or replace function private.hit_rate(p_uid uuid, p_bucket text, p_max integer, p_window_s integer) returns void
language plpgsql as $$
declare r private.rate_limits;
begin
  insert into private.rate_limits as rl (user_id, bucket, window_start, hits) values (p_uid, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    hits = case when rl.window_start < now() - make_interval(secs => p_window_s) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_s) then now() else rl.window_start end
  returning * into r;
  if r.hits > p_max then perform private.fail('rate_limited', 'Muitas requisições: espere alguns segundos.'); end if;
end $$;

create or replace function private.ledger(p_uid uuid, p_company uuid, p_currency text, p_item text, p_amount bigint, p_balance bigint,
  p_kind text, p_desc text, p_ref jsonb default null, p_request uuid default null, p_by uuid default null) returns void
language sql as $$
  insert into public.transactions (user_id, company_id, currency_id, item_id, amount, balance_after, kind, description, ref, request_id, created_by)
  values (p_uid, p_company, p_currency, p_item, p_amount, p_balance, p_kind, left(p_desc, 300), p_ref, p_request, p_by);
$$;

-- ---------------------------------------------------------------------------
-- signup: profile (unique username), wallet with the welcome Gold, inventory
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'jogador'), '[^a-zA-Z0-9_]', '', 'g'));
  name text;
  n integer := 0;
  welcome bigint := coalesce((select (value ->> 'welcome_gold')::bigint from public.game_config where key = 'economy'), 100);
begin
  base := left(base, 16);
  if char_length(base) < 3 then base := 'jogador'; end if;
  name := base;
  while exists (select 1 from public.profiles where lower(username) = name) loop
    n := n + 1;
    name := left(base, 15) || n::text;
  end loop;
  insert into public.profiles (id, username, display_name) values (new.id, name, left(coalesce(new.raw_user_meta_data ->> 'display_name', name), 32));
  insert into public.wallets (user_id, gold) values (new.id, welcome);
  insert into public.inventories (user_id) values (new.id);
  insert into public.transactions (user_id, currency_id, amount, balance_after, kind, description) values (new.id, 'gold', welcome, welcome, 'welcome', 'Boas-vindas · moeda dourada');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
create or replace function private.inventory_state(p_uid uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'wallet', (select jsonb_build_object('gold', gold, 'credits', credits) from public.wallets where user_id = p_uid),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity, 'source', source, 'event_id', event_id,
              'first_acquired_at', first_acquired_at, 'updated_at', updated_at) order by first_acquired_at) from public.inventory_items where user_id = p_uid), '[]'),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from public.equipped_items where user_id = p_uid), '{}'),
    'legendary', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'item_id', item_id, 'name', name, 'level', level, 'status', status, 'employee_id', employee_id) order by acquired_at)
              from public.legendary_bots where user_id = p_uid), '[]'),
    'avatar', (select avatar from public.profiles where id = p_uid)
  );
$$;

-- add items (and one legendary bot row per unit for bot items)
create or replace function private.add_item(p_uid uuid, p_item text, p_qty integer, p_source public.grant_type) returns void
language plpgsql as $$
declare it public.items; tpl public.legendary_bot_templates; i integer;
begin
  select * into it from public.items where id = p_item;
  if not found then perform private.fail('item_not_found', 'Item inexistente.'); end if;
  if p_qty < 1 or p_qty > 1000 then perform private.fail('bad_quantity', 'Quantidade inválida.'); end if;
  insert into public.inventory_items as v (user_id, item_id, quantity, source, event_id)
  values (p_uid, p_item, p_qty, p_source, it.event_id)
  on conflict (user_id, item_id) do update set quantity = v.quantity + excluded.quantity, updated_at = now();
  if it.category_id = 'legend' then
    select * into tpl from public.legendary_bot_templates where item_id = p_item;
    for i in 1 .. p_qty loop
      insert into public.legendary_bots (user_id, item_id, name, level, skills, source)
      values (p_uid, p_item, coalesce(tpl.name, it.name), coalesce(tpl.level, 8),
              '{"redes":86,"servidores":86,"sistemas":86,"seguranca":86,"gestao":86}'::jsonb, p_source);
    end loop;
  end if;
end $$;

create or replace function private.shop_purchase(p_uid uuid, p_item text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; w public.wallets; q integer;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into it from public.items where id = p_item and active;
  if not found then perform private.fail('item_not_found', 'Item inexistente.'); end if;
  if it.gift then perform private.fail('use_claim', 'Este item é um presente: resgate em vez de comprar.'); end if;
  if not it.purchasable or it.price <= 0 then perform private.fail('not_for_sale', 'Este item não está à venda.'); end if;
  if it.event_id is not null and not private.event_active(it.event_id) then perform private.fail('event_over', 'O evento deste item terminou.'); end if;
  select quantity into q from public.inventory_items where user_id = p_uid and item_id = p_item;
  q := coalesce(q, 0);
  if not it.stackable and q > 0 then perform private.fail('already_owned', 'Este item já está no seu inventário.'); end if;
  if it.max_quantity is not null and q >= it.max_quantity then perform private.fail('max_quantity', 'Você já tem o máximo deste item.'); end if;
  if it.currency_id = 'gold' then
    if w.gold < it.price then perform private.fail('insufficient_gold', 'Gold insuficiente.'); end if;
    update public.wallets set gold = gold - it.price where user_id = p_uid returning * into w;
    perform private.ledger(p_uid, null, 'gold', null, -it.price, w.gold, 'purchase', 'Loja: ' || it.name, jsonb_build_object('item', it.id), p_request);
  else
    if w.credits < it.price then perform private.fail('insufficient_credits', 'Créditos insuficientes.'); end if;
    update public.wallets set credits = credits - it.price where user_id = p_uid returning * into w;
    perform private.ledger(p_uid, null, 'credits', null, -it.price, w.credits, 'purchase', 'Loja: ' || it.name, jsonb_build_object('item', it.id), p_request);
  end if;
  perform private.add_item(p_uid, p_item, 1, case when it.event_id is not null then 'event' else 'shop' end::public.grant_type);
  perform private.ledger(p_uid, null, null, p_item, 1, null, 'purchase', 'Item: ' || it.name);
  return private.inventory_state(p_uid);
end $$;

create or replace function private.shop_claim_gift(p_uid uuid, p_item text) returns jsonb
language plpgsql as $$
declare it public.items;
begin
  perform private.lock_player(p_uid);
  select * into it from public.items where id = p_item and active;
  if not found or not it.gift then perform private.fail('not_a_gift', 'Este item não é um presente.'); end if;
  if it.event_id is null or not private.event_active(it.event_id) then perform private.fail('event_over', 'O evento deste presente terminou.'); end if;
  if exists (select 1 from public.item_grants where user_id = p_uid and item_id = p_item and grant_type = 'event' and granted_by is null)
     or exists (select 1 from public.inventory_items where user_id = p_uid and item_id = p_item) then
    perform private.fail('already_claimed', 'Você já resgatou este presente.');
  end if;
  perform private.add_item(p_uid, p_item, 1, 'event');
  insert into public.item_grants (granted_by, user_id, item_id, quantity, grant_type, reason) values (null, p_uid, p_item, 1, 'event', 'Presente do evento ' || it.event_id);
  perform private.ledger(p_uid, null, null, p_item, 1, null, 'claim', 'Presente: ' || it.name);
  return private.inventory_state(p_uid);
end $$;

create or replace function private.inventory_sell(p_uid uuid, p_item text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; w public.wallets; v public.inventory_items; refund bigint; bot uuid;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item for update;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if not it.sellable or it.price <= 0 or it.gift or it.event_id is not null or it.grant_type <> 'shop' then
    perform private.fail('not_sellable', 'Este item não pode ser vendido.');
  end if;
  if it.category_id = 'legend' then
    select id into bot from public.legendary_bots where user_id = p_uid and item_id = p_item and status = 'stored' order by acquired_at desc limit 1 for update;
    if bot is null then perform private.fail('bot_active', 'Guarde o bot (dispense-o no jogo e salve) antes de vender.'); end if;
    delete from public.legendary_bots where id = bot;
  end if;
  refund := floor(it.price / 2.0);
  if v.quantity > 1 then update public.inventory_items set quantity = quantity - 1 where id = v.id;
  else delete from public.inventory_items where id = v.id; end if;   -- equipped_items cascades
  update public.wallets set gold = gold + refund where user_id = p_uid returning * into w;
  perform private.ledger(p_uid, null, 'gold', null, refund, w.gold, 'sell', 'Venda: ' || it.name, jsonb_build_object('item', it.id), p_request);
  perform private.ledger(p_uid, null, null, p_item, -1, null, 'sell', 'Item vendido: ' || it.name);
  -- a sold cosmetic leaves the avatar too
  update public.profiles set avatar = avatar where id = p_uid;
  return private.inventory_state(p_uid);
end $$;

-- avatar fields for character slots
create or replace function private.avatar_patch(p_item public.items, p_on boolean) returns jsonb
language sql immutable as $$
  select case p_item.slot
    when 'shirt' then jsonb_build_object('outfit', case when p_on then p_item.value else '"tee"'::jsonb end)
    when 'pants' then jsonb_build_object('pantsStyle', case when p_on then p_item.value else '""'::jsonb end)
    when 'hair' then jsonb_build_object('hairStyle', case when p_on then p_item.value else '"short"'::jsonb end)
    when 'hat' then jsonb_build_object('hat', case when p_on then p_item.value else '""'::jsonb end, 'hatColor', case when p_on and p_item.color is not null then to_jsonb(p_item.color) else 'null'::jsonb end)
    when 'shades' then jsonb_build_object('shades', p_on)
    when 'scarf' then jsonb_build_object('scarf', p_on)
    when 'backpack' then jsonb_build_object('backpack', p_on)
    when 'chain' then jsonb_build_object('chain', p_on)
    else '{}'::jsonb end;
$$;

create or replace function private.inventory_equip(p_uid uuid, p_item text) returns jsonb
language plpgsql as $$
declare it public.items; v public.inventory_items;
begin
  perform private.lock_player(p_uid);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if it.slot is null or it.slot in ('palette', 'use', 'bot') then perform private.fail('not_equippable', 'Este item não é equipável.'); end if;
  insert into public.equipped_items (user_id, slot, item_id, inventory_item_id) values (p_uid, it.slot, it.id, v.id)
  on conflict (user_id, slot) do update set item_id = excluded.item_id, inventory_item_id = excluded.inventory_item_id, equipped_at = now();
  if it.category_id = 'char' then
    update public.profiles set avatar = (case when jsonb_typeof(avatar) = 'object' then avatar else '{}'::jsonb end) || private.avatar_patch(it, true) where id = p_uid;
  end if;
  return private.inventory_state(p_uid);
end $$;

create or replace function private.inventory_unequip(p_uid uuid, p_slot text) returns jsonb
language plpgsql as $$
declare it public.items;
begin
  perform private.lock_player(p_uid);
  select i.* into it from public.equipped_items e join public.items i on i.id = e.item_id where e.user_id = p_uid and e.slot = p_slot;
  if it.id is null then perform private.fail('not_equipped', 'Nada equipado neste espaço.'); end if;
  delete from public.equipped_items where user_id = p_uid and slot = p_slot;
  if it.category_id = 'char' then update public.profiles set avatar = avatar || private.avatar_patch(it, false) where id = p_uid; end if;
  return private.inventory_state(p_uid);
end $$;

create or replace function private.inventory_consume(p_uid uuid, p_item text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; v public.inventory_items;
begin
  perform private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item for update;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if it.slot is distinct from 'use' then perform private.fail('not_consumable', 'Este item não é consumível.'); end if;
  if v.quantity > 1 then update public.inventory_items set quantity = quantity - 1 where id = v.id;
  else delete from public.inventory_items where id = v.id; end if;
  perform private.ledger(p_uid, null, null, p_item, -1, null, 'consume', 'Usado: ' || it.name, jsonb_build_object('effect', it.value), p_request);
  return private.inventory_state(p_uid) || jsonb_build_object('effect', it.value);
end $$;

create or replace function private.wallet_exchange(p_uid uuid, p_credits integer, p_request uuid) returns jsonb
language plpgsql as $$
declare w public.wallets; rate integer := coalesce((private.econ('{gold_rate}'))::integer, 10); g bigint; cost bigint;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  if p_credits is null or p_credits < rate or p_credits > 1000000 then perform private.fail('bad_amount', 'Mínimo de ' || rate || ' créditos.'); end if;
  g := p_credits / rate;
  cost := g * rate;
  if w.credits < cost then perform private.fail('insufficient_credits', 'Créditos insuficientes.'); end if;
  update public.wallets set credits = credits - cost, gold = gold + g where user_id = p_uid returning * into w;
  perform private.ledger(p_uid, null, 'credits', null, -cost, w.credits, 'exchange', 'Câmbio → ' || g || ' Gold', null, p_request);
  perform private.ledger(p_uid, null, 'gold', null, g, w.gold, 'exchange', 'Câmbio de ' || cost || ' créditos');
  return private.inventory_state(p_uid);
end $$;

-- ---------------------------------------------------------------------------
-- staff: grants and roles (the Edge Function checks the role; checked again here)
-- ---------------------------------------------------------------------------
create or replace function private.admin_grant(p_actor uuid, p_target uuid, p_item text, p_currency text, p_qty integer,
  p_type public.grant_type, p_reason text, p_request uuid) returns jsonb
language plpgsql as $$
declare it public.items; w public.wallets; gid bigint; q integer;
begin
  if not private.has_role(p_actor, array['admin', 'developer']::public.app_role[]) then
    perform private.fail('forbidden', 'Sem permissão para conceder itens.');
  end if;
  if p_type not in ('developer', 'founder', 'beta', 'event', 'compensation', 'special') then perform private.fail('bad_grant_type', 'Tipo de concessão inválido.'); end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then perform private.fail('reason_required', 'Informe o motivo (mínimo 3 caracteres).'); end if;
  if (p_item is null) = (p_currency is null) then perform private.fail('bad_target', 'Escolha um item OU uma moeda.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then perform private.fail('user_not_found', 'Jogador não encontrado.'); end if;
  -- developer grants are for the dev team: only admins hand out currency or developer items to others
  if p_currency is not null and not private.has_role(p_actor, array['admin']::public.app_role[]) then
    perform private.fail('forbidden', 'Só administradores concedem moedas.');
  end if;
  w := private.lock_player(p_target);
  perform private.check_request(p_target, p_request);
  if p_item is not null then
    select * into it from public.items where id = p_item;
    if not found then perform private.fail('item_not_found', 'Item inexistente.'); end if;
    if p_qty is null or p_qty < 1 or p_qty > 100 then perform private.fail('bad_quantity', 'Quantidade de 1 a 100.'); end if;
    select quantity into q from public.inventory_items where user_id = p_target and item_id = p_item;
    if not it.stackable and (coalesce(q, 0) > 0 or p_qty > 1) then perform private.fail('already_owned', 'O jogador já tem este item (não acumulável).'); end if;
    perform private.add_item(p_target, p_item, p_qty, p_type);
    insert into public.item_grants (granted_by, user_id, item_id, quantity, grant_type, reason) values (p_actor, p_target, p_item, p_qty, p_type, trim(p_reason)) returning id into gid;
    perform private.ledger(p_target, null, null, p_item, p_qty, null, 'grant', 'Concedido: ' || it.name || ' · ' || trim(p_reason), jsonb_build_object('grant', gid), p_request, p_actor);
  else
    if p_currency not in ('gold', 'credits') then perform private.fail('bad_currency', 'Moeda inválida.'); end if;
    if p_qty is null or p_qty < 1 or p_qty > 1000000 then perform private.fail('bad_quantity', 'Valor de 1 a 1.000.000.'); end if;
    if p_currency = 'gold' then update public.wallets set gold = gold + p_qty where user_id = p_target returning * into w;
    else update public.wallets set credits = credits + p_qty where user_id = p_target returning * into w; end if;
    insert into public.item_grants (granted_by, user_id, currency_id, quantity, grant_type, reason) values (p_actor, p_target, p_currency, p_qty, p_type, trim(p_reason)) returning id into gid;
    perform private.ledger(p_target, null, p_currency, null, p_qty, case when p_currency = 'gold' then w.gold else w.credits end, 'grant', 'Concessão · ' || trim(p_reason), jsonb_build_object('grant', gid), p_request, p_actor);
  end if;
  return (select to_jsonb(g) from public.item_grants g where id = gid);
end $$;

create or replace function private.admin_set_role(p_actor uuid, p_target uuid, p_role public.app_role, p_on boolean) returns jsonb
language plpgsql as $$
begin
  if not private.has_role(p_actor, array['admin']::public.app_role[]) then perform private.fail('forbidden', 'Só administradores mudam papéis.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then perform private.fail('user_not_found', 'Jogador não encontrado.'); end if;
  if p_on then
    insert into public.user_roles (user_id, role, granted_by) values (p_target, p_role, p_actor) on conflict do nothing;
  else
    if p_role = 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1 and exists (select 1 from public.user_roles where user_id = p_target and role = 'admin') then
      perform private.fail('last_admin', 'Não é possível remover o último administrador.');
    end if;
    delete from public.user_roles where user_id = p_target and role = p_role;
  end if;
  return coalesce((select jsonb_agg(role) from public.user_roles where user_id = p_target), '[]');
end $$;

create or replace function private.admin_find_users(p_actor uuid, p_query text) returns jsonb
language plpgsql stable as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'created_at', p.created_at,
      'roles', coalesce((select jsonb_agg(role) from public.user_roles r where r.user_id = p.id), '[]')) order by p.username)
    from (select * from public.profiles where p_query is null or char_length(p_query) < 2 or username ilike '%' || replace(replace(p_query, '%', ''), '_', '\_') || '%' or id::text = p_query limit 25) p), '[]');
end $$;

create or replace function private.admin_grants_log(p_actor uuid, p_limit integer) returns jsonb
language plpgsql stable as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select g.id, g.created_at, g.item_id, g.currency_id, g.quantity, g.grant_type, g.reason,
           (select username from public.profiles where id = g.user_id) as to_user, (select username from public.profiles where id = g.granted_by) as by_user
    from public.item_grants g order by g.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]');
end $$;

-- ---------------------------------------------------------------------------
-- game: new game, land, saves (with the server-side economy)
-- ---------------------------------------------------------------------------
create or replace function private.game_new(p_uid uuid, p_slot integer, p_name text, p_preset text) returns jsonb
language plpgsql as $$
declare
  pre jsonb := private.econ(array['presets', p_preset]);
  co public.companies; dc public.datacenters; sv public.game_saves;
  live boolean;
begin
  perform private.lock_player(p_uid);
  if p_slot not between 1 and 3 then perform private.fail('bad_slot', 'Espaço de save inválido (1 a 3).'); end if;
  if pre is null then perform private.fail('bad_preset', 'Ponto de partida desconhecido.'); end if;
  live := coalesce((pre ->> 'live')::boolean, false);
  -- a new game in a used slot replaces it (cascades company, datacenter, projection)
  delete from public.companies where id in (select company_id from public.game_saves where user_id = p_uid and slot = p_slot);
  insert into public.companies (user_id, name, cash, phase, starter_kit, first_contract)
  values (p_uid, left(coalesce(nullif(trim(p_name), ''), 'Meu datacenter'), 40), (pre ->> 'cash')::bigint, case when live then 'live' else 'setup' end,
          coalesce(private.econ('{starter_kit}'), '{}'), live)
  returning * into co;
  insert into public.datacenters (user_id, company_id, name, preset) values (p_uid, co.id, co.name, p_preset) returning * into dc;
  insert into public.terrain (datacenter_id, user_id, width, height) values (dc.id, p_uid, (pre -> 'lot' ->> 'w')::smallint, (pre -> 'lot' ->> 'h')::smallint);
  insert into public.game_saves (user_id, slot, name, company_id, datacenter_id, baseline)
  values (p_uid, p_slot, co.name, co.id, dc.id, jsonb_build_object('items', coalesce(pre -> 'items', '{}'), 'crew', coalesce((pre ->> 'crew')::int, 0)))
  returning * into sv;
  perform private.ledger(p_uid, co.id, 'cash', null, co.cash, co.cash, 'new_game', 'Nova empresa · ' || p_preset);
  return jsonb_build_object('save_id', sv.id, 'slot', sv.slot, 'cash', co.cash, 'phase', co.phase, 'kit', co.starter_kit,
    'terrain', jsonb_build_object('w', (pre -> 'lot' ->> 'w')::int, 'h', (pre -> 'lot' ->> 'h')::int), 'version', 0);
end $$;

create or replace function private.lot_price(p_w integer, p_h integer, p_dw integer, p_dh integer, p_built integer) returns bigint
language sql stable as $$
  with l as (select private.econ('{lot}') as v)
  select case when ((p_w + greatest(p_dw, 0)) * (p_h + greatest(p_dh, 0)) - p_w * p_h) <= 0 then 0 else
    private.round50(((p_w + greatest(p_dw, 0)) * (p_h + greatest(p_dh, 0)) - p_w * p_h)
      * ((v ->> 'base')::numeric * power(greatest(1, (p_w * p_h)::numeric / (v ->> 'freeArea')::numeric), (v ->> 'growth')::numeric)
      * (1 + coalesce(p_built, 0)::numeric / (v ->> 'builtK')::numeric))) end
  from l;
$$;

create or replace function private.game_expand_lot(p_uid uuid, p_slot integer, p_dw integer, p_dh integer, p_request uuid, p_built integer default 0) returns jsonb
language plpgsql as $$
declare sv public.game_saves; co public.companies; tr public.terrain; built integer; price bigint; kit integer;
begin
  perform private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  if not ((p_dw = 4 and p_dh = 0) or (p_dw = 0 and p_dh = 4)) then perform private.fail('bad_expansion', 'Expansão inválida.'); end if;
  select * into sv from public.game_saves where user_id = p_uid and slot = p_slot;
  if not found then perform private.fail('save_not_found', 'Save não encontrado.'); end if;
  select * into co from public.companies where id = sv.company_id for update;
  select * into tr from public.terrain where datacenter_id = sv.datacenter_id for update;
  if tr.width + p_dw > 64 or tr.height + p_dh > 48 then perform private.fail('lot_limit', 'Limite do terreno: 64 × 48.'); end if;
  select coalesce(sum(w * h), 0) into built from public.buildings where datacenter_id = sv.datacenter_id;
  -- the client's floor area counts only when larger (it can only make the land dearer, never cheaper)
  built := greatest(built, least(coalesce(p_built, 0), 64 * 48));
  kit := coalesce((co.starter_kit ->> 'lot')::int, 0);
  price := case when kit > 0 then 0 else private.lot_price(tr.width, tr.height, p_dw, p_dh, built) end;
  if co.cash < price then perform private.fail('insufficient_cash', 'Caixa insuficiente para expandir o terreno.'); end if;
  update public.companies set cash = cash - price,
    starter_kit = case when kit > 0 then jsonb_set(starter_kit, '{lot}', to_jsonb(kit - 1)) else starter_kit end
  where id = co.id returning * into co;
  update public.terrain set width = width + p_dw, height = height + p_dh, expansions = expansions + 1, land_paid = land_paid + price
  where datacenter_id = sv.datacenter_id returning * into tr;
  insert into public.finances as f (company_id, user_id, month, land) values (co.id, p_uid, co.month, price)
  on conflict (company_id, month) do update set land = f.land + excluded.land;
  perform private.ledger(p_uid, co.id, 'cash', null, -price, co.cash, 'land', 'Terreno → ' || tr.width || '×' || tr.height, jsonb_build_object('dw', p_dw, 'dh', p_dh), p_request);
  return jsonb_build_object('cash', co.cash, 'price', price, 'kit', co.starter_kit, 'terrain', jsonb_build_object('w', tr.width, 'h', tr.height, 'expansions', tr.expansions));
end $$;

-- Save = validate the snapshot, price what changed since the last save (the server's prices, the
-- starter kit and the preset's free baseline), cap revenue and credits by what the datacenter can
-- really earn in the elapsed time, enforce minimum operating costs, check legendary bots and skins
-- belong to the player, rewrite the projection tables and the books. All in one transaction.
create or replace function private.game_save(p_uid uuid, p_slot integer, p_data jsonb, p_claim jsonb, p_request uuid) returns jsonb
language plpgsql as $$
declare
  cfgv jsonb := private.cfg('economy');
  sv public.game_saves; co public.companies; tr public.terrain; w public.wallets;
  lot_w integer; lot_h integer;
  real_min numeric; claim_min numeric; mins numeric;
  kit jsonb; base jsonb; base_crew integer;
  r record; price integer; kk text; auto_doors integer;
  purchases bigint := 0; refunds bigint := 0; hires bigint := 0; revenue bigint := 0; opex bigint := 0; opex_min numeric := 0;
  online integer := 0; new_online integer := 0; storages integer := 0; aps integer := 0;
  cap numeric; claim_rev numeric; first_contract_now boolean := false;
  credits_allowed numeric; credits_award bigint := 0; gold_award bigint := 0;
  payroll numeric := 0; sal numeric; lvl integer; fee bigint;
  changes jsonb := '[]'; new_items jsonb; new_crew jsonb; dc_ok boolean; month_new integer;
  emp_id uuid; bot uuid;
begin
  w := private.lock_player(p_uid);
  perform private.check_request(p_uid, p_request);
  select * into sv from public.game_saves where user_id = p_uid and slot = p_slot for update;
  if not found then perform private.fail('save_not_found', 'Crie um jogo neste espaço primeiro.'); end if;
  select * into co from public.companies where id = sv.company_id for update;
  select * into tr from public.terrain where datacenter_id = sv.datacenter_id for update;

  -- ---------- shape ----------
  if jsonb_typeof(p_data) <> 'object' or coalesce((p_data ->> 'v')::int, 0) <> 1 then perform private.fail('bad_save', 'Formato de save inválido.'); end if;
  if jsonb_typeof(p_data -> 'items') <> 'array' or jsonb_typeof(p_data -> 'areas') <> 'array' then perform private.fail('bad_save', 'Save sem itens/áreas.'); end if;
  if jsonb_array_length(p_data -> 'items') > 4000 or jsonb_array_length(p_data -> 'areas') > 60
     or jsonb_array_length(coalesce(p_data -> 'crew', '[]')) > 12 or jsonb_array_length(coalesce(p_data -> 'vms', '[]')) > 200
     or jsonb_array_length(coalesce(p_data -> 'links', '[]')) > 2000 or jsonb_array_length(coalesce(p_data -> 'walls', '[]')) > 8000 then
    perform private.fail('save_too_big', 'Save grande demais.');
  end if;
  lot_w := (p_data -> 'lot' ->> 'w')::int;
  lot_h := (p_data -> 'lot' ->> 'h')::int;
  if lot_w is null or lot_h is null or lot_w < 6 or lot_h < 6 then perform private.fail('bad_lot', 'Terreno inválido.'); end if;
  -- the land must have been paid for (expand_lot); shrinking is allowed and gives nothing back
  if lot_w > tr.width or lot_h > tr.height then perform private.fail('lot_not_paid', 'O terreno do save é maior que o comprado.'); end if;
  if exists (select 1 from jsonb_array_elements(p_data -> 'areas') a
             where (a ->> 'x')::int < 0 or (a ->> 'y')::int < 0 or (a ->> 'w')::int < 1 or (a ->> 'h')::int < 1
                or (a ->> 'x')::int + (a ->> 'w')::int > lot_w or (a ->> 'y')::int + (a ->> 'h')::int > lot_h) then
    perform private.fail('bad_areas', 'Área fora do terreno.');
  end if;

  -- ---------- elapsed time (1 real second = 1 game minute) ----------
  real_min := extract(epoch from (now() - co.last_settled_at));
  claim_min := greatest(0, least(coalesce((p_claim ->> 'elapsed_min')::numeric, 0), 7200));
  mins := least(claim_min, real_min * 1.1 + 10);

  -- ---------- items in the snapshot ----------
  create temp table _it on commit drop as
    select coalesce(e ->> 'uid', '') as k, e ->> 'def' as def, coalesce((e ->> 'tx')::int, 0) as tx, coalesce((e ->> 'ty')::int, 0) as ty,
           coalesce((e ->> 'rot')::int, 0) as rot, e ->> 'skin' as skin, e ->> 'id' as rid, e -> 'units' as units, ord::int as ord, 0 as paid, e as raw
    from jsonb_array_elements(p_data -> 'items') with ordinality as t(e, ord);
  if exists (select 1 from _it where k !~ '^[A-Za-z0-9:_-]{1,40}$') then perform private.fail('bad_item', 'Item sem identificador.'); end if;
  if exists (select k from _it group by k having count(*) > 1) then perform private.fail('bad_item', 'Itens duplicados no save.'); end if;
  select def into kk from _it where def is null or def not in (select id from public.equipment_prices) limit 1;
  if found then perform private.fail('unknown_item', 'Item desconhecido no save: ' || coalesce(kk, '?')); end if;
  if exists (select 1 from _it where tx < 0 or ty < 0 or tx >= lot_w or ty >= lot_h or rot not between 0 and 3) then perform private.fail('bad_item', 'Item fora do terreno.'); end if;

  create temp table _un on commit drop as
    select i.rid || ':' || (u.ord - 1) as device_key, i.rid as rack_key, (u.ord - 1)::int as slot, u.v #>> '{}' as def, p.unit_kind as kind, 0 as paid,
           coalesce(d.d ->> 'state', 'new') as state, d.d ->> 'name' as name, d.d ->> 'ip' as ip, d.d ->> 'svc' as svc
    from _it i
    cross join lateral jsonb_array_elements(case when jsonb_typeof(i.units) = 'array' then i.units else '[]' end) with ordinality as u(v, ord)
    left join public.equipment_prices p on p.id = u.v #>> '{}'
    left join lateral (select x as d from jsonb_array_elements(coalesce(p_data -> 'devices', '[]')) x where x ->> 'key' = i.rid || ':' || (u.ord - 1) limit 1) d on true
    where jsonb_typeof(u.v) = 'string';
  if exists (select 1 from _it where jsonb_typeof(units) = 'array' and (jsonb_array_length(units) > 9 or coalesce(rid, '') !~ '^[A-Za-z0-9-]{1,20}$')) then
    perform private.fail('bad_rack', 'Rack inválido no save.');
  end if;
  if exists (select 1 from _un where kind is null) then perform private.fail('unknown_item', 'Equipamento de rack desconhecido.'); end if;
  if exists (select device_key from _un group by device_key having count(*) > 1) then perform private.fail('bad_rack', 'Racks com o mesmo identificador.'); end if;
  update _un set state = 'new' where state not in ('new', 'link', 'online') or kind <> 'server' and state <> 'online';

  -- ---------- skins on objects: only the player's own ----------
  for r in select k, skin from _it where skin is not null and skin <> 'none'
             and not exists (select 1 from public.inventory_items v join public.items i on i.id = v.item_id
                             where v.user_id = p_uid and v.item_id = _it.skin and i.slot in ('rack', 'storage')) loop
    update _it set skin = null where k = r.k;
    changes := changes || jsonb_build_object('type', 'skin_removed', 'uid', r.k);
  end loop;

  -- ---------- price what is new: preset baseline (first save) → starter kit → server price ----------
  kit := coalesce(co.starter_kit, '{}');
  base := case when sv.version = 0 then coalesce(sv.baseline -> 'items', '{}') else '{}' end;
  base_crew := case when sv.version = 0 then coalesce((sv.baseline ->> 'crew')::int, 0) else 0 end;
  -- doors created automatically between two new areas are free: at most 2 per floor area
  auto_doors := 2 * jsonb_array_length(p_data -> 'areas');
  for r in select n.k, n.def, p.price, p.kind, coalesce((n.raw ->> 'auto')::boolean, false) as auto from _it n join public.equipment_prices p on p.id = n.def
           where not exists (select 1 from public.furniture f where f.datacenter_id = sv.datacenter_id and f.item_key = n.k and f.def_id = n.def)
           order by n.ord loop
    kk := case when r.kind = 'desk' then 'desk' when r.def = 'rack' then 'rack' else null end;
    if r.auto and r.def in ('door', 'door2') and auto_doors > 0 then auto_doors := auto_doors - 1; price := 0;
    elsif coalesce((base ->> r.def)::int, 0) > 0 then base := jsonb_set(base, array[r.def], to_jsonb((base ->> r.def)::int - 1)); price := 0;
    elsif kk is not null and coalesce((kit ->> kk)::int, 0) > 0 then kit := jsonb_set(kit, array[kk], to_jsonb((kit ->> kk)::int - 1)); price := 0;
    else price := r.price; end if;
    purchases := purchases + price;
    update _it set paid = price where _it.k = r.k;
  end loop;
  update _it n set paid = f.paid from public.furniture f where f.datacenter_id = sv.datacenter_id and f.item_key = n.k and f.def_id = n.def;
  select coalesce(sum(floor(f.paid * 0.5)), 0) into refunds from public.furniture f
   where f.datacenter_id = sv.datacenter_id and not exists (select 1 from _it n where n.k = f.item_key and n.def = f.def_id);

  for r in select u.device_key, u.def, u.kind, p.price from _un u join public.equipment_prices p on p.id = u.def
           where not exists (select 1 from public.servers s where s.datacenter_id = sv.datacenter_id and s.device_key = u.device_key and s.server_type_id = u.def) loop
    kk := r.kind; -- server | switch | patch
    if coalesce((base ->> r.def)::int, 0) > 0 then base := jsonb_set(base, array[r.def], to_jsonb((base ->> r.def)::int - 1)); price := 0;
    elsif coalesce((base ->> kk)::int, 0) > 0 then base := jsonb_set(base, array[kk], to_jsonb((base ->> kk)::int - 1)); price := 0;
    elsif coalesce((kit ->> kk)::int, 0) > 0 then kit := jsonb_set(kit, array[kk], to_jsonb((kit ->> kk)::int - 1)); price := 0;
    else price := r.price; end if;
    purchases := purchases + price;
    update _un set paid = price where _un.device_key = r.device_key;
  end loop;
  update _un u set paid = s.paid from public.servers s where s.datacenter_id = sv.datacenter_id and s.device_key = u.device_key and s.server_type_id = u.def;
  select refunds + coalesce(sum(floor(s.paid * 0.5)), 0) into refunds from public.servers s
   where s.datacenter_id = sv.datacenter_id and not exists (select 1 from _un u where u.device_key = s.device_key and u.def = s.server_type_id);

  -- ---------- what the datacenter can earn ----------
  select count(*) filter (where kind = 'server' and state = 'online') into online from _un;
  select count(*) into new_online from _un u where u.kind = 'server' and u.state = 'online'
    and not exists (select 1 from public.servers s where s.datacenter_id = sv.datacenter_id and s.device_key = u.device_key and s.state = 'online');
  select count(*) filter (where p.kind = 'storage'), count(*) filter (where p.kind = 'ap') into storages, aps from _it n join public.equipment_prices p on p.id = n.def;

  -- ---------- crew ----------
  create temp table _cr on commit drop as
    select (c ->> 'key')::int as emp_key, left(coalesce(c ->> 'name', 'Bot'), 32) as name, left(coalesce(c ->> 'role', 'funcionario'), 40) as role,
           least(10, greatest(1, coalesce((c ->> 'level')::int, 1))) as level, greatest(0, least(100000, coalesce((c ->> 'xp')::int, 0))) as xp,
           least(1.08, greatest(0.92, coalesce((c ->> 'pay')::numeric, 1))) as pay, nullif(c ->> 'legend', '') as legend, c as raw, ord::int as ord
    from jsonb_array_elements(coalesce(p_data -> 'crew', '[]')) with ordinality as t(c, ord);
  if exists (select 1 from _cr where emp_key is null) or exists (select emp_key from _cr group by emp_key having count(*) > 1) then
    perform private.fail('bad_crew', 'Equipe inválida no save.');
  end if;
  -- legendary bots: must be the player's, one employee each
  for r in select emp_key, legend from _cr where legend is not null loop
    bot := null;
    begin bot := r.legend::uuid; exception when others then bot := null; end;
    if bot is null or not exists (select 1 from public.legendary_bots b where b.id = bot and b.user_id = p_uid)
       or (select count(*) from _cr where legend = r.legend) > 1 then
      update _cr set legend = null where emp_key = r.emp_key;
      changes := changes || jsonb_build_object('type', 'legend_removed', 'key', r.emp_key);
    end if;
  end loop;
  -- level can't jump: new hires start at most at level 3 (legendary: 8), others gain at most 2 per save
  update _cr c set level = least(c.level, case when c.legend is not null then 10 else coalesce(e.level + 2, 3) end)
    from (select _cr.emp_key, e.level from _cr left join public.employees e on e.datacenter_id = sv.datacenter_id and e.emp_key = _cr.emp_key) e
   where e.emp_key = c.emp_key;
  for r in select c.*, (select e.id from public.employees e where e.datacenter_id = sv.datacenter_id and e.emp_key = c.emp_key) as eid from _cr c order by ord loop
    sal := private.round50(coalesce((cfgv -> 'salary' ->> r.role)::numeric, (cfgv ->> 'salary_custom')::numeric)
             * (1 + (cfgv ->> 'salary_per_level')::numeric * (r.level - 1)) * r.pay);
    payroll := payroll + sal;
    if r.eid is null and r.legend is null then
      if base_crew > 0 then base_crew := base_crew - 1;
      elsif coalesce((kit ->> 'hire')::int, 0) > 0 then kit := jsonb_set(kit, '{hire}', to_jsonb((kit ->> 'hire')::int - 1));
      else fee := private.round50(sal * (cfgv ->> 'hire_fee')::numeric); hires := hires + fee; end if;
    end if;
  end loop;

  -- ---------- money ----------
  cap := online * (cfgv ->> 'max_rev_per_server')::numeric + storages * (cfgv ->> 'max_rev_per_storage')::numeric
       + aps * (cfgv ->> 'max_rev_per_ap')::numeric + (cfgv ->> 'max_sales_per_min')::numeric;
  claim_rev := greatest(0, coalesce((p_claim ->> 'revenue')::numeric, 0));
  if not co.first_contract and online > 0 then first_contract_now := true; end if;
  revenue := least(claim_rev, cap * mins + case when first_contract_now then (cfgv ->> 'first_contract')::numeric else 0 end)::bigint;
  -- operating costs: what the client reports, never less than the salaries (after the tutorial window)
  if co.phase = 'live' and sv.play_minutes + mins > (cfgv ->> 'grace_minutes')::numeric then
    opex_min := payroll / (cfgv ->> 'month_minutes')::numeric * (cfgv ->> 'opex_floor')::numeric * mins;
  end if;
  opex := greatest(coalesce((p_claim ->> 'opex')::numeric, 0), opex_min)::bigint;

  co.cash := co.cash + revenue - opex - purchases - hires + refunds;
  if co.cash < (cfgv ->> 'min_cash')::bigint then perform private.fail('cash_invalid', 'Saldo da empresa inconsistente: recarregue o último save.'); end if;

  -- credits: capped per minute + 50 per server newly online + incidents; Gold for a completed datacenter
  -- (anti-farming: servers that come with the preset don't count, and per save at most one newly-online
  -- server per 5 real minutes and one incident per 10 — configuring and fixing take real time)
  if sv.version = 0 then new_online := 0; end if;
  credits_allowed := mins * ((cfgv ->> 'credits_per_min')::numeric + online * (cfgv ->> 'credits_per_online_min')::numeric)
                   + least(new_online, floor(mins / 5) + 1) * (cfgv ->> 'credits_per_server_online')::numeric
                   + least(jsonb_array_length(coalesce(p_claim -> 'incidents', '[]')), floor(mins / 10) + 1, 20) * (cfgv ->> 'credits_per_incident')::numeric;
  -- (anti-farming: the save must have been played for a while, and at most 3 such rewards a day per player)
  dc_ok := coalesce((p_claim ->> 'dc_done')::boolean, false) and not co.dc_rewarded and online >= 2
           and sv.play_minutes + mins >= coalesce((cfgv ->> 'dc_min_minutes')::numeric, 60)
           and (select count(*) from public.transactions t where t.user_id = p_uid and t.kind = 'reward' and t.currency_id = 'gold'
                and t.description = 'Datacenter concluído' and t.created_at > now() - interval '1 day') < coalesce((cfgv ->> 'dc_rewards_per_day')::int, 3)
           and exists (select 1 from _un where kind = 'switch') and exists (select 1 from _it n join public.equipment_prices p on p.id = n.def where p.kind = 'desk')
           and (select count(*) from _cr) >= 2;
  if dc_ok then credits_allowed := credits_allowed + (cfgv ->> 'credits_dc')::numeric; gold_award := (cfgv ->> 'gold_dc')::bigint; co.dc_rewarded := true; end if;
  credits_award := least(greatest(coalesce((p_claim ->> 'credits')::numeric, 0), 0), credits_allowed)::bigint;

  -- ---------- projection ----------
  delete from public.buildings where datacenter_id = sv.datacenter_id;
  insert into public.buildings (datacenter_id, user_id, area_key, name, x, y, w, h, floor)
  select sv.datacenter_id, p_uid, left(coalesce(a ->> 'id', 'a' || ord), 20), left(a ->> 'name', 40), (a ->> 'x')::int, (a ->> 'y')::int, (a ->> 'w')::int, (a ->> 'h')::int, left(a ->> 'floor', 20)
  from jsonb_array_elements(p_data -> 'areas') with ordinality as t(a, ord)
  on conflict (datacenter_id, area_key) do nothing;

  delete from public.rooms where datacenter_id = sv.datacenter_id;
  insert into public.rooms (datacenter_id, user_id, name, type, theme, style, x, y, w, h, tiles)
  select sv.datacenter_id, p_uid, left(coalesce(nullif(r2 ->> 'name', ''), 'Sala'), 40), left(r2 ->> 'type', 20), left(r2 ->> 'theme', 20),
         case when jsonb_typeof(r2 -> 'style') = 'object' and pg_column_size(r2 -> 'style') < 2000 then r2 -> 'style' end,
         (r2 ->> 'x')::int, (r2 ->> 'y')::int, (r2 ->> 'w')::int, (r2 ->> 'h')::int, (r2 ->> 'n')::int
  from jsonb_array_elements(coalesce(p_data -> 'rooms', '[]')) r2 limit 60;

  delete from public.furniture where datacenter_id = sv.datacenter_id;
  insert into public.furniture (datacenter_id, user_id, item_key, def_id, kind, tx, ty, rot, skin_item_id, paid, data)
  select sv.datacenter_id, p_uid, n.k, n.def, p.kind, n.tx, n.ty, n.rot, case when n.skin in (select id from public.items) then n.skin end, n.paid,
         (n.raw - 'units' - 'uid' - 'def' - 'tx' - 'ty' - 'rot' - 'skin')
  from _it n join public.equipment_prices p on p.id = n.def;

  delete from public.servers where datacenter_id = sv.datacenter_id;
  insert into public.servers (datacenter_id, user_id, device_key, rack_key, slot, kind, server_type_id, name, ip, state, specialization, paid)
  select sv.datacenter_id, p_uid, device_key, rack_key, slot, kind, def, left(name, 24), left(ip, 40), state, left(svc, 16), paid from _un;

  delete from public.virtual_machines where datacenter_id = sv.datacenter_id;
  insert into public.virtual_machines (datacenter_id, user_id, vm_key, node_key, name, os, specialization, vcpu, ram_gb, disk_gb, status)
  select sv.datacenter_id, p_uid, (v ->> 'id')::int, v ->> 'node', lower(left(regexp_replace(coalesce(v ->> 'name', 'vm'), '[^a-zA-Z0-9.-]', '-', 'g'), 24)),
         left(v ->> 'os', 30), left(v ->> 'svc', 16), least(256, greatest(1, (v ->> 'cores')::int)), least(4096, greatest(1, (v ->> 'ram')::int)),
         least(100000, greatest(8, (v ->> 'disk')::int)), case when v ->> 'status' = 'running' then 'running' else 'stopped' end
  from jsonb_array_elements(coalesce(p_data -> 'vms', '[]')) v
  where (v ->> 'id') ~ '^[0-9]{1,9}$' and exists (select 1 from _un u where u.device_key = v ->> 'node' and u.kind = 'server')
  on conflict (datacenter_id, vm_key) do nothing;

  -- crew: upsert, drop the ones gone, refresh skills / schedules, salary history when it changes
  update public.legendary_bots set status = 'stored', employee_id = null where user_id = p_uid
    and employee_id in (select id from public.employees where datacenter_id = sv.datacenter_id);
  delete from public.employees where datacenter_id = sv.datacenter_id and emp_key not in (select emp_key from _cr);
  update public.employees set legendary_bot_id = null, is_legendary = false where datacenter_id = sv.datacenter_id;
  for r in select c.*, not exists (select 1 from public.employees x where x.datacenter_id = sv.datacenter_id and x.emp_key = c.emp_key) as fresh from _cr c order by ord loop
    insert into public.employees as e (datacenter_id, user_id, emp_key, name, role, is_legendary, legendary_bot_id, level, xp, pay_factor, profile)
    values (sv.datacenter_id, p_uid, r.emp_key, r.name, r.role, r.legend is not null, r.legend::uuid, r.level, r.xp, r.pay,
            case when jsonb_typeof(r.raw -> 'profile') = 'object' and pg_column_size(r.raw -> 'profile') < 3000 then r.raw -> 'profile' else '{}' end)
    on conflict (datacenter_id, emp_key) do update set name = excluded.name, role = excluded.role, is_legendary = excluded.is_legendary,
      legendary_bot_id = excluded.legendary_bot_id, level = excluded.level, xp = excluded.xp, pay_factor = excluded.pay_factor, profile = excluded.profile
    returning id into emp_id;
    if r.legend is not null then update public.legendary_bots set status = 'active', employee_id = emp_id, level = r.level where id = r.legend::uuid; end if;
    delete from public.bot_skills where employee_id = emp_id;
    insert into public.bot_skills (employee_id, skill, value)
    select emp_id, s.key, least(99, greatest(0, (s.value #>> '{}')::numeric))
    from jsonb_each(case when jsonb_typeof(r.raw -> 'skills') = 'object' then r.raw -> 'skills' else '{}' end) s
    where s.key in ('redes', 'servidores', 'sistemas', 'seguranca', 'gestao') and jsonb_typeof(s.value) = 'number';
    insert into public.bot_schedules as b (employee_id, shift_id, start_hour, end_hour, oncall)
    values (emp_id, left(coalesce(r.raw -> 'shift' ->> 'id', 'integral'), 20), least(24, greatest(0, coalesce((r.raw -> 'shift' ->> 'start')::int, 0))),
            least(24, greatest(0, coalesce((r.raw -> 'shift' ->> 'end')::int, 24))),
            coalesce(array(select left(x, 12) from jsonb_array_elements_text(case when jsonb_typeof(r.raw -> 'oncall') = 'array' then r.raw -> 'oncall' else '[]' end) x limit 3), '{}'))
    on conflict (employee_id) do update set shift_id = excluded.shift_id, start_hour = excluded.start_hour, end_hour = excluded.end_hour, oncall = excluded.oncall;
    sal := private.round50(coalesce((cfgv -> 'salary' ->> r.role)::numeric, (cfgv ->> 'salary_custom')::numeric) * (1 + (cfgv ->> 'salary_per_level')::numeric * (r.level - 1)) * r.pay);
    if coalesce((select monthly from public.salaries where employee_id = emp_id order by created_at desc, id desc limit 1), -1) <> sal then
      insert into public.salaries (employee_id, user_id, monthly, reason) values (emp_id, p_uid, sal::int, case when r.fresh then 'hire' else 'level' end);
    end if;
  end loop;

  -- incidents the client resolved (bounded)
  insert into public.incidents (datacenter_id, user_id, device_key, type, opened_minutes, resolved_by, loss)
  select sv.datacenter_id, p_uid, left(i ->> 'device', 40), left(coalesce(i ->> 'type', 'fault'), 24), least(100000, greatest(0, coalesce((i ->> 'open')::int, 0))),
         case when i ->> 'by' = 'crew' then 'crew' else 'player' end, least(10000000, greatest(0, coalesce((i ->> 'loss')::int, 0)))
  from (select i from jsonb_array_elements(coalesce(p_claim -> 'incidents', '[]')) i limit 20) x;

  -- ---------- sanitized snapshot back into the save ----------
  select coalesce(jsonb_agg(case when n.skin is null then n.raw - 'skin' else n.raw || jsonb_build_object('skin', n.skin) end order by n.ord), '[]') into new_items from _it n;
  select coalesce(jsonb_agg(case when c.legend is null then c.raw - 'legend' else c.raw end || jsonb_build_object('level', c.level, 'pay', c.pay) order by c.ord), '[]') into new_crew from _cr c;
  month_new := least(greatest(co.month, coalesce((p_data -> 'econ' ->> 'month')::int, co.month)), co.month + floor(mins / (cfgv ->> 'month_minutes')::numeric)::int + 1);

  update public.terrain set width = lot_w, height = lot_h where datacenter_id = sv.datacenter_id;
  update public.companies set cash = co.cash, phase = case when co.phase = 'live' or exists (select 1 from _un where kind = 'server') then 'live' else 'setup' end,
    starter_kit = kit, first_contract = co.first_contract or first_contract_now, dc_rewarded = co.dc_rewarded, month = month_new, last_settled_at = now()
  where id = co.id returning * into co;
  update public.game_saves set data = p_data || jsonb_build_object('items', new_items, 'crew', new_crew), version = version + 1,
    name = left(coalesce(nullif(trim(p_data ->> 'name'), ''), name), 40), play_minutes = play_minutes + mins::bigint,
    stats = jsonb_build_object('rooms', jsonb_array_length(coalesce(p_data -> 'rooms', '[]')), 'racks', (select count(*) from _it where def = 'rack'),
                               'servers', (select count(*) from _un where kind = 'server'), 'online', online, 'crew', (select count(*) from _cr), 'cash', co.cash)
  where id = sv.id returning * into sv;
  update public.wallets set credits = credits + credits_award, gold = gold + gold_award where user_id = p_uid returning * into w;

  insert into public.finances as f (company_id, user_id, month, income, costs, purchases, hires)
  values (co.id, p_uid, co.month, revenue + refunds, opex, purchases, hires)
  on conflict (company_id, month) do update set income = f.income + excluded.income, costs = f.costs + excluded.costs,
    purchases = f.purchases + excluded.purchases, hires = f.hires + excluded.hires;

  -- the ledger: one summary row carries the request id, the rest detail it
  perform private.ledger(p_uid, co.id, 'cash', null, revenue + refunds - opex - purchases - hires, co.cash, 'adjust', 'Fechamento do save',
    jsonb_build_object('minutes', round(mins), 'revenue', revenue, 'claimed_revenue', round(claim_rev), 'opex', opex, 'purchases', purchases, 'refunds', refunds, 'hires', hires), p_request);
  if revenue > 0 then perform private.ledger(p_uid, co.id, 'cash', null, revenue, null, 'revenue', 'Receitas · ' || round(mins) || ' min'); end if;
  if opex > 0 then perform private.ledger(p_uid, co.id, 'cash', null, -opex, null, 'opex', 'Despesas (salários, energia, aluguel…)'); end if;
  if purchases > 0 then perform private.ledger(p_uid, co.id, 'cash', null, -purchases, null, 'equipment', 'Equipamentos instalados'); end if;
  if refunds > 0 then perform private.ledger(p_uid, co.id, 'cash', null, refunds, null, 'refund', 'Revenda de equipamentos'); end if;
  if hires > 0 then perform private.ledger(p_uid, co.id, 'cash', null, -hires, null, 'hire', 'Contratações'); end if;
  if credits_award > 0 then perform private.ledger(p_uid, co.id, 'credits', null, credits_award, w.credits, 'reward', 'Créditos do jogo'); end if;
  if gold_award > 0 then perform private.ledger(p_uid, co.id, 'gold', null, gold_award, w.gold, 'reward', 'Datacenter concluído'); end if;
  if online > 0 then insert into public.user_achievements (user_id, achievement_id) values (p_uid, 'first_online') on conflict do nothing; end if;
  if dc_ok then insert into public.user_achievements (user_id, achievement_id) values (p_uid, 'first_datacenter') on conflict do nothing; end if;

  return jsonb_build_object('version', sv.version, 'cash', co.cash, 'phase', co.phase, 'kit', co.starter_kit, 'month', co.month,
    'gold', w.gold, 'credits', w.credits, 'credits_awarded', credits_award, 'gold_awarded', gold_award,
    'charged', jsonb_build_object('purchases', purchases, 'refunds', refunds, 'hires', hires, 'revenue', revenue, 'opex', opex, 'minutes', round(mins)),
    'changes', changes, 'terrain', jsonb_build_object('w', tr.width, 'h', tr.height));
end $$;

-- everything the client needs to continue a save (snapshot + the server's authoritative numbers)
create or replace function private.game_load(p_uid uuid, p_slot integer) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'save', jsonb_build_object('slot', s.slot, 'name', s.name, 'version', s.version, 'data', s.data, 'updated_at', s.updated_at, 'play_minutes', s.play_minutes),
    'preset', d.preset,
    'company', jsonb_build_object('cash', c.cash, 'phase', c.phase, 'kit', c.starter_kit, 'month', c.month, 'first_contract', c.first_contract, 'dc_rewarded', c.dc_rewarded),
    'terrain', jsonb_build_object('w', t.width, 'h', t.height, 'expansions', t.expansions),
    'legendary', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'item_id', b.item_id, 'name', b.name, 'status', b.status)) from public.legendary_bots b where b.user_id = p_uid), '[]'))
  from public.game_saves s join public.companies c on c.id = s.company_id join public.datacenters d on d.id = s.datacenter_id
  join public.terrain t on t.datacenter_id = s.datacenter_id
  where s.user_id = p_uid and s.slot = p_slot;
$$;

create or replace function private.game_delete(p_uid uuid, p_slot integer) returns jsonb
language plpgsql as $$
begin
  perform private.lock_player(p_uid);
  update public.legendary_bots set status = 'stored', employee_id = null where user_id = p_uid and employee_id in (
    select e.id from public.employees e join public.game_saves s on s.datacenter_id = e.datacenter_id where s.user_id = p_uid and s.slot = p_slot);
  delete from public.companies where id in (select company_id from public.game_saves where user_id = p_uid and slot = p_slot);
  return jsonb_build_object('deleted', p_slot);
end $$;

-- nobody but the database owner (the Edge Functions' connection) runs these
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon, authenticated', f.sig); end if;
  end loop;
end $$;
