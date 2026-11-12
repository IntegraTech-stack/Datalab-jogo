-- DataLab · 019 · Rastros + Passe Boot Inicial – Temporada 1
-- Rastros (slot 'trail', assets/js/trails.js): an effect left on the floor while the character walks.
--   · the shop sells six simple ones (category 'trail', paid in Gold, common / rare / epic);
--   · the season pass gives seven fancier ones.
-- Passe Boot Inicial – Temporada 1 (assets/js/battlepass.js): 50 levels earned by playing, 60 days long.
--   Every reward has the new rarity EXCLUSIVO T1: never sold (purchasable false, price 0, sellable false),
--   out of reach once the season ends, kept forever. Levels without an item give Gold.
--   The game sends the pass XP it saw and the missions it finished (Edge Function "pass"); private.pass_sync
--   caps the XP by the time that went by since the last sync, counts each mission once (3 a day, 3 a week),
--   raises the level and puts each level's reward in the inventory (grant_type 'reward', item_grants audit).
-- New equip slots: 'trail', 'frame' (profile frame), 'title' (Pioneiro) — the Edge Function "inventory"
-- accepts them for unequip. The pass furniture is a save catalog entry like the shop's (category 'cosm').
begin;

-- 1) the rarity and the shop categories
insert into public.rarities (id, name, rank, color) values ('exclusive_t1', 'Exclusivo T1', 5, '#b8f3ff')
  on conflict (id) do update set name = excluded.name, rank = excluded.rank, color = excluded.color;
insert into public.shop_categories (id, name, sort) values ('trail', 'Rastros', 7), ('pass', 'Passe', 8)
  on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- 2) the shop's trails (paid in Gold, one of each)
with n (id, value, name, description, rarity_id, price) as (values
  ('tr_lights', 'lights', 'Pontinhos de Luz', 'Pontos azuis que ficam no ar por onde você passa e somem devagar.', 'epic', 120),
  ('tr_smoke', 'smoke', 'Fumacinha', 'Uma nuvem leve de fumaça cinza-azulada atrás do personagem.', 'epic', 100),
  ('tr_bubbles', 'bubbles', 'Bolhas', 'Bolhinhas que sobem do chão e estouram em pixels.', 'rare', 70),
  ('tr_stars', 'stars', 'Estrelinhas', 'Pequenas estrelas que piscam no chão por onde você anda.', 'rare', 60),
  ('tr_dust', 'dust', 'Poeira Pixel', 'Um pozinho cinza que sobe dos sapatos a cada passo.', 'common', 35),
  ('tr_steps', 'steps', 'Pegadas Turquesa', 'Pegadas turquesa simples que marcam o caminho.', 'common', 30)
)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color)
select id, 'trail', 'trail', to_jsonb(value), name, description, rarity_id, 'gold', price, false, null, true, true, false, 'shop', null, null from n
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description,
  rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable,
  purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;

-- 3) the pass' rewards: never for sale, never sold back
with n (id, category_id, slot, value, name, description, stackable) as (values
  ('bp_frame_t1', 'pass', 'frame', 't1', 'Moldura T1', 'Moldura de perfil turquesa com cantos em pixel e o selo T1. Aparece na Conta e na sala online.', false),
  ('bp_title_pioneer', 'pass', 'title', 'pioneer', 'Título Pioneiro', 'O único título do Passe Boot. Aparece embaixo do seu nome no jogo e na sala online.', false),
  ('bp_emote_hack', 'pass', 'emote', 'hack', 'Invasão', 'Digita rapidíssimo num teclado holográfico e aparece "ACESSO LIBERADO" em cima do personagem.', false),
  ('bp_pet_bitzero', 'char', 'pet', 'bitzero', 'BIT ZERO', 'Robozinho de tela quadrada que pisca 0 e 1 em binário e segue você pelo datacenter.', false),
  ('bp_glasses001', 'char', 'face', 'g001', 'Óculos 001', 'Óculos escuros com "001" aceso em turquesa nas lentes.', false),
  ('bp_skin_founder', 'char', 'shirt', 'bp_founder', 'Skin Fundador', 'Hacker de sobretudo preto com bordas turquesa e "001" brilhando nas costas.', false),
  ('bp_term_boot', 'equip', 'terminal', 'boot', 'Terminal Boot', 'Tela verde de quem liga a máquina pela primeira vez: "iniciando sistema…" com a barra de carga.', false),
  ('bp_relic', 'equip', 'rack', 'm_relic', 'Servidor Relíquia', 'Gabinete antigo, bege-acinzentado e rachado, com um LED âmbar teimoso: o primeiro servidor do mundo.', false),
  ('bp_xp2', 'special', 'use', 'bpxp', 'Bônus de XP do Passe', 'Consumível: o XP do passe vale em dobro por 1 hora jogando.', true),
  ('bp_trail_binary', 'trail', 'trail', 'binary', 'Rastro Binário', 'Zeros e uns turquesa caem do ar e brilham onde o personagem pisa.', false),
  ('bp_trail_sparks', 'trail', 'trail', 'sparks', 'Rastro de Faíscas', 'Faíscas elétricas pequenas estalam e pulam a cada passo.', false),
  ('bp_trail_cables', 'trail', 'trail', 'cables', 'Rastro de Cabos', 'Fios coloridos que serpenteiam pelo chão, aparecem e somem.', false),
  ('bp_trail_ghost', 'trail', 'trail', 'ghost', 'Rastro Fantasma', 'Pegadas azuis meio transparentes, com um vapor de luz subindo delas.', false),
  ('bp_trail_code', 'trail', 'trail', 'code', 'Rastro de Código', 'Letrinhas turquesa sobem do chão como código rolando.', false),
  ('bp_trail_glitch', 'trail', 'trail', 'glitch', 'Rastro Glitch', 'O chão "falha" e treme em faixas de cor onde o personagem pisa.', false),
  ('bp_trail_rainbow', 'trail', 'trail', 'rainbow', 'Rastro Arco-íris Pixel', 'Uma faixa de arco-íris em pixel com brilhos, o prêmio final do passe.', false),
  ('bp_hello', 'decor', 'furniture', 'bp_hello', 'Quadro "Hello World"', 'Na parede: o primeiro programa de todo mundo, com o cursor piscando. 2 tiles.', false),
  ('bp_rug_mobo', 'decor', 'furniture', 'bp_rug_mobo', 'Tapete Placa-Mãe', 'Tapete 2 × 2 com o desenho de uma placa-mãe: trilhas turquesa, chips e slots.', false),
  ('bp_led_lamp', 'decor', 'furniture', 'bp_led_lamp', 'Luminária de LED Piscando', 'Uma coluna de LEDs que acende devagar, como um servidor ligando.', false),
  ('bp_coffee8', 'decor', 'furniture', 'bp_coffee8', 'Máquina de Café 8-bit', 'Máquina de café quadradona que solta fumacinha em pixel.', false),
  ('bp_floppy_shelf', 'decor', 'furniture', 'bp_floppy_shelf', 'Estante de Disquetes', 'Prateleira cheia de disquetes coloridos de 3½".', false),
  ('bp_founder_chair', 'decor', 'furniture', 'bp_founder_chair', 'Cadeira do Fundador', 'Cadeira gamer preta com detalhes turquesa e o selo 001 no encosto.', false),
  ('bp_data_vault', 'decor', 'furniture', 'bp_data_vault', 'Cofre de Dados', 'Cofre de aço com um cadeado digital piscando no painel.', false),
  ('bp_hacker_desk', 'decor', 'furniture', 'bp_hacker_desk', 'Mesa Hacker', 'Mesa com 3 monitores mostrando código, teclado aceso e café. 2 tiles.', false),
  ('bp_crt_terminal', 'decor', 'furniture', 'bp_crt_terminal', 'Terminal de Tubo', 'Computador antigo de tela verde, com o prompt piscando.', false),
  ('bp_arcade_boot', 'decor', 'furniture', 'bp_arcade_boot', 'Fliperama Boot', 'Fliperama com o logo do DataLab no letreiro e um jogo de boot na tela.', false),
  ('bp_neon_boot', 'decor', 'furniture', 'bp_neon_boot', 'Placa Neon "BOOT 001"', 'Letreiro neon para pendurar na parede. 2 tiles.', false)
)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color)
select id, category_id, slot, to_jsonb(value), name, description, 'exclusive_t1', 'gold', 0, stackable, null, false, false, false, 'reward', null, null from n
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description,
  rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable,
  purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;

-- the relic is a rack skin: a rack in build mode may wear it on its own (the save keeps it)
insert into public.skins (item_id, target, theme) values ('bp_relic', 'rack', 'Passe T1')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;

-- the pass furniture as save catalog entries (build mode → Cosméticos): placing is free, and the trigger
-- of migration 018 (furniture_cosm_owned) keeps a piece in a save only while the player owns it
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values
  ('bp_hello', 'bp_hello', null, 'cosm', 'Quadro Hello World', 0),
  ('bp_rug_mobo', 'rug_mobo', null, 'cosm', 'Tapete placa-mãe', 0),
  ('bp_led_lamp', 'bp_led_lamp', null, 'cosm', 'Luminária de LED', 0),
  ('bp_coffee8', 'bp_coffee8', null, 'cosm', 'Máquina de café 8-bit', 0),
  ('bp_floppy_shelf', 'bp_floppy_shelf', null, 'cosm', 'Estante de disquetes', 0),
  ('bp_founder_chair', 'bp_founder_chair', null, 'cosm', 'Cadeira do Fundador', 0),
  ('bp_data_vault', 'bp_data_vault', null, 'cosm', 'Cofre de dados', 0),
  ('bp_hacker_desk', 'bp_hacker_desk', null, 'cosm', 'Mesa hacker', 0),
  ('bp_crt_terminal', 'bp_crt_terminal', null, 'cosm', 'Terminal de tubo', 0),
  ('bp_arcade_boot', 'bp_arcade_boot', null, 'cosm', 'Fliperama Boot', 0),
  ('bp_neon_boot', 'bp_neon_boot', null, 'cosm', 'Placa neon BOOT 001', 0)
on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;

-- 4) furniture, consumables and emotes are never equipped (an owned emote is always on)
create or replace function private.inventory_equip(p_uid uuid, p_item text) returns jsonb
language plpgsql as $$
declare it public.items; v public.inventory_items;
begin
  perform private.lock_player(p_uid);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if it.slot is null or it.slot in ('palette', 'use', 'bot', 'furniture', 'emote') then perform private.fail('not_equippable', 'Este item não é equipável.'); end if;
  insert into public.equipped_items (user_id, slot, item_id, inventory_item_id) values (p_uid, it.slot, it.id, v.id)
  on conflict (user_id, slot) do update set item_id = excluded.item_id, inventory_item_id = excluded.inventory_item_id, equipped_at = now();
  if it.category_id = 'char' then
    update public.profiles set avatar = (case when jsonb_typeof(avatar) = 'object' then avatar else '{}'::jsonb end) || private.avatar_patch(it, true) where id = p_uid;
  end if;
  return private.inventory_state(p_uid);
end $$;

-- 5) the season, its rewards and each player's pass
create table if not exists public.pass_seasons (
  id text primary key check (id ~ '^[a-z0-9_]{1,20}$'),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_level smallint not null default 50 check (max_level between 1 and 200),
  constraint pass_seasons_window check (ends_at > starts_at)
);
insert into public.pass_seasons (id, name, starts_at, ends_at, max_level)
values ('s1', 'Passe Boot Inicial – Temporada 1', '2026-10-31 00:00:00-03', '2026-10-31 00:00:00-03'::timestamptz + interval '60 days', 50)
on conflict (id) do update set name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at, max_level = excluded.max_level;

create table if not exists public.pass_rewards (
  season_id text not null references public.pass_seasons (id) on delete cascade,
  level smallint not null check (level >= 1),
  items text[] not null default '{}',
  gold integer not null default 0 check (gold >= 0),
  primary key (season_id, level)
);
-- the items (the same table as assets/js/battlepass.js REWARD); every other level gives Gold:
-- 10 below level 20, 15 from 20 to 39, 25 from 40
insert into public.pass_rewards (season_id, level, items, gold)
select 's1', l, coalesce(r.items, '{}'), case when r.items is not null then 0 when l < 20 then 10 when l < 40 then 15 else 25 end
from generate_series(1, 50) l
left join (values
  (1, array['bp_frame_t1']), (3, array['bp_hello']), (5, array['bp_trail_binary']), (7, array['bp_rug_mobo']), (10, array['bp_pet_bitzero']),
  (12, array['bp_led_lamp']), (14, array['bp_trail_sparks']), (15, array['bp_xp2']), (17, array['bp_coffee8']), (19, array['bp_glasses001']),
  (20, array['bp_emote_hack']), (22, array['bp_floppy_shelf']), (24, array['bp_trail_cables']), (25, array['bp_xp2']), (27, array['bp_founder_chair']),
  (29, array['bp_term_boot']), (30, array['bp_relic']), (32, array['bp_data_vault']), (34, array['bp_trail_ghost']), (35, array['bp_xp2']),
  (37, array['bp_hacker_desk']), (39, array['bp_crt_terminal']), (40, array['bp_trail_code']), (42, array['bp_arcade_boot']), (44, array['bp_trail_glitch']),
  (46, array['bp_neon_boot']), (48, array['bp_skin_founder']), (50, array['bp_trail_rainbow', 'bp_title_pioneer'])
) as r (lv, items) on r.lv = l
on conflict (season_id, level) do update set items = excluded.items, gold = excluded.gold;

create table if not exists public.battle_passes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id text not null references public.pass_seasons (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  level smallint not null default 0 check (level >= 0),
  missions jsonb not null default '[]'::jsonb,   -- keys of the missions already counted ('d:2026-11-02:fix')
  synced_at timestamptz not null default now(),  -- the XP cap runs from here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id)
);
drop trigger if exists battle_passes_touch on public.battle_passes;
create trigger battle_passes_touch before update on public.battle_passes for each row execute function private.touch_updated_at();

-- a sync's request id is used once (a retried request never counts twice)
create table if not exists private.pass_requests (
  user_id uuid not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table private.pass_requests enable row level security;

-- players read their own pass (the client reads it through the Edge Function anyway); the season and the
-- rewards are public catalog data
alter table public.battle_passes enable row level security;
alter table public.pass_seasons enable row level security;
alter table public.pass_rewards enable row level security;
drop policy if exists battle_passes_own on public.battle_passes;
create policy battle_passes_own on public.battle_passes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists pass_seasons_read on public.pass_seasons;
create policy pass_seasons_read on public.pass_seasons for select using (true);
drop policy if exists pass_rewards_read on public.pass_rewards;
create policy pass_rewards_read on public.pass_rewards for select using (true);
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.battle_passes, public.pass_seasons, public.pass_rewards from anon, authenticated;
    grant select on public.battle_passes to authenticated;
    grant select on public.pass_seasons, public.pass_rewards to anon, authenticated;
  end if;
end $$;

-- 6) the logic (called only by the Edge Function "pass", with the user id from the JWT)
-- XP to reach level L (each level asks 40 more than the one before: 200, 240, 280…)
create or replace function private.pass_xp_total(p_level integer) returns integer
language sql immutable as $$ select 200 * p_level + 20 * p_level * (p_level - 1) $$;

create or replace function private.pass_level_at(p_xp integer, p_max integer) returns integer
language plpgsql immutable as $$
declare l integer := 0;
begin
  while l < p_max and p_xp >= private.pass_xp_total(l + 1) loop l := l + 1; end loop;
  return l;
end $$;

-- the player's pass row (created on first use, with 10 minutes of XP allowance)
create or replace function private.pass_row(p_uid uuid, p_season text) returns public.battle_passes
language plpgsql as $$
declare bp public.battle_passes;
begin
  insert into public.battle_passes (user_id, season_id, synced_at) values (p_uid, p_season, now() - interval '10 minutes')
  on conflict (user_id, season_id) do nothing;
  select * into bp from public.battle_passes where user_id = p_uid and season_id = p_season for update;
  return bp;
end $$;

create or replace function private.pass_json(bp public.battle_passes, s public.pass_seasons) returns jsonb
language sql stable as $$
  select jsonb_build_object('season', s.id, 'xp', bp.xp, 'level', bp.level, 'max_level', s.max_level,
    'missions', bp.missions, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'active', now() >= s.starts_at and now() < s.ends_at);
$$;

create or replace function private.pass_state(p_uid uuid, p_season text) returns jsonb
language plpgsql as $$
declare s public.pass_seasons; bp public.battle_passes;
begin
  select * into s from public.pass_seasons where id = p_season;
  if not found then perform private.fail('season_not_found', 'Temporada do passe inexistente.'); end if;
  perform private.lock_player(p_uid);
  bp := private.pass_row(p_uid, p_season);
  return jsonb_build_object('pass', private.pass_json(bp, s));
end $$;

-- p_xp: pass XP seen since the last sync (time played + the game's actions, doubled by the bonus);
-- p_missions: [{ k: 'd:YYYY-MM-DD:id' | 'w:YYYY-MM-DD(monday):id', xp }] finished since the last sync
create or replace function private.pass_sync(p_uid uuid, p_season text, p_xp integer, p_missions jsonb, p_request uuid) returns jsonb
language plpgsql as $$
declare
  s public.pass_seasons; bp public.battle_passes;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  week date; mins numeric; allowed bigint; gain bigint := 0; m jsonb; k text; kind text; per date; mxp integer;
  keys jsonb; new_level integer; lv integer; r public.pass_rewards; iid text; it public.items; q integer; w public.wallets;
begin
  select * into s from public.pass_seasons where id = p_season;
  if not found then perform private.fail('season_not_found', 'Temporada do passe inexistente.'); end if;
  w := private.lock_player(p_uid);
  bp := private.pass_row(p_uid, p_season);
  -- a retried request is answered with the current state, without counting again
  if p_request is not null then
    insert into private.pass_requests (user_id, request_id) values (p_uid, p_request) on conflict do nothing;
    if not found then return jsonb_build_object('pass', private.pass_json(bp, s), 'inventory', private.inventory_state(p_uid), 'duplicate', true); end if;
  end if;
  -- the season is over (or not started): nothing more is earned
  if now() < s.starts_at or now() >= s.ends_at then
    return jsonb_build_object('pass', private.pass_json(bp, s), 'inventory', private.inventory_state(p_uid));
  end if;

  -- XP: at most 150 a minute since the last sync (3 hours banked at most) — playing earns ~10-60 a minute
  mins := least(extract(epoch from (now() - bp.synced_at)) / 60.0, 180);
  allowed := floor(mins * 150) + 20;
  gain := least(greatest(coalesce(p_xp, 0), 0), allowed);

  -- missions: well-formed keys of today (± a day for time zones) / this week, 3 of each per period, once
  week := today - ((extract(isodow from today)::int) - 1);
  keys := case when jsonb_typeof(bp.missions) = 'array' then bp.missions else '[]'::jsonb end;
  for m in select x from jsonb_array_elements(case when jsonb_typeof(p_missions) = 'array' then p_missions else '[]'::jsonb end) x limit 12 loop
    k := m ->> 'k';
    if k is null or k !~ '^[dw]:[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-z]{2,10}$' or keys ? k then continue; end if;
    kind := split_part(k, ':', 1);
    begin per := split_part(k, ':', 2)::date; exception when others then continue; end;
    mxp := least(greatest(coalesce((m ->> 'xp')::integer, 0), 0), case when kind = 'd' then 250 else 1000 end);
    if kind = 'd' and (per < today - 1 or per > today + 1) then continue; end if;
    if kind = 'w' and (extract(isodow from per) <> 1 or per < week - 7 or per > week) then continue; end if;
    if (select count(*) from jsonb_array_elements_text(keys) e where e like kind || ':' || to_char(per, 'YYYY-MM-DD') || ':%') >= 3 then continue; end if;
    keys := keys || to_jsonb(k);
    gain := gain + mxp;
  end loop;
  -- only the last two weeks of mission keys are kept
  select coalesce(jsonb_agg(e), '[]'::jsonb) into keys from jsonb_array_elements_text(keys) e
   where split_part(e, ':', 2)::date >= today - 14;

  -- level and rewards
  bp.xp := least(bp.xp + gain, 2000000000);
  new_level := private.pass_level_at(bp.xp, s.max_level);
  for lv in bp.level + 1 .. new_level loop
    select * into r from public.pass_rewards where season_id = s.id and level = lv;
    if not found then continue; end if;
    foreach iid in array r.items loop
      select * into it from public.items where id = iid;
      if not found then continue; end if;
      select quantity into q from public.inventory_items where user_id = p_uid and item_id = iid;
      if it.stackable or coalesce(q, 0) = 0 then
        perform private.add_item(p_uid, iid, 1, 'reward');
        insert into public.item_grants (granted_by, user_id, item_id, quantity, grant_type, reason)
        values (null, p_uid, iid, 1, 'reward', 'Passe Boot Inicial · nível ' || lv);
        perform private.ledger(p_uid, null, null, iid, 1, null, 'reward', 'Passe Boot · nível ' || lv || ': ' || it.name);
      end if;
    end loop;
    if r.gold > 0 then
      update public.wallets set gold = gold + r.gold where user_id = p_uid returning * into w;
      perform private.ledger(p_uid, null, 'gold', null, r.gold, w.gold, 'reward', 'Passe Boot · nível ' || lv);
    end if;
  end loop;
  update public.battle_passes set xp = bp.xp, level = greatest(bp.level, new_level), missions = keys, synced_at = now()
   where user_id = p_uid and season_id = s.id returning * into bp;
  return jsonb_build_object('pass', private.pass_json(bp, s), 'inventory', private.inventory_state(p_uid), 'gained', gain);
end $$;

-- nobody but the database owner (the Edge Functions' connection) runs these
do $$
declare f text;
begin
  foreach f in array array['private.pass_xp_total(integer)', 'private.pass_level_at(integer, integer)', 'private.pass_row(uuid, text)',
    'private.pass_json(public.battle_passes, public.pass_seasons)', 'private.pass_state(uuid, text)', 'private.pass_sync(uuid, text, integer, jsonb, uuid)',
    'private.inventory_equip(uuid, text)'] loop
    execute 'revoke all on function ' || f || ' from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function ' || f || ' from anon, authenticated'; end if;
  end loop;
end $$;

commit;
