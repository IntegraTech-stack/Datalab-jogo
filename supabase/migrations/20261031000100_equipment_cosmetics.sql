-- DataLab · 018 · the Equipamentos and Cosméticos tabs
-- The shop (assets/js/cosmetics.js) now also sells:
--   · Equipamentos · skins de hacks: 6 looks for the in-game terminal (slot 'terminal', one equipped);
--   · Equipamentos · skins de PCs e servidores: 6 skins (slot 'rack') that dress every rack, the servers
--     in it and every storage;
--   · Cosméticos: 11 pieces of furniture (slot 'furniture'). Never equipped: once owned they are placed in
--     build mode for free (one of each), so each one is also a save catalog entry (equipment_prices, price
--     0, category 'cosm') — a save may only keep the ones the player owns (trigger below).
-- The Edge Function "inventory" accepts the 'terminal' slot for unequip (supabase/functions/inventory).
begin;

-- 1) the two shop categories
insert into public.shop_categories (id, name, sort) values ('equip', 'Equipamentos', 5), ('decor', 'Cosméticos', 6)
  on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- 2) the new items (all paid in Gold, one of each)
with n (id, category_id, slot, value, name, description, rarity_id, price, sellable) as (values
  ('term_retro', 'equip', 'terminal', 'retro', 'Terminal Retrô', 'Tela de fósforo verde dos anos 80, com linhas de varredura e o brilho do tubo.', 'common', 40, true),
  ('term_neon', 'equip', 'terminal', 'neon', 'Terminal Neon Turquesa', 'Letras turquesa com brilho de neon e borda acesa em volta do console.', 'rare', 70, true),
  ('term_matrix', 'equip', 'terminal', 'matrix', 'Terminal Matrix', 'Colunas de caracteres turquesa caindo no fundo enquanto você digita.', 'epic', 120, true),
  ('term_skull', 'equip', 'terminal', 'skull', 'Terminal Caveira Pixel', 'Uma caveira em pixel art no fundo do console, com os olhos piscando em azul.', 'epic', 140, true),
  ('term_glitch', 'equip', 'terminal', 'glitch', 'Terminal Glitch', 'O console treme de vez em quando e as cores falham em faixas azuis e turquesa.', 'epic', 160, true),
  ('term_holo', 'equip', 'terminal', 'holo', 'Terminal Holográfico', 'Painel de luz azul meio transparente, com grade e uma linha de varredura subindo.', 'legendary', 240, true),
  ('m_retro', 'equip', 'rack', 'm_retro', 'PC Retrô', 'Gabinete bege dos anos 90, com grade de ventilação, selo azul e luz de força.', 'common', 60, true),
  ('m_led', 'equip', 'rack', 'm_led', 'Gabinete LED Turquesa', 'Azul-marinho com trilhos de LED turquesa que pulsam devagar.', 'rare', 90, true),
  ('m_armor', 'equip', 'rack', 'm_armor', 'Servidor Blindado', 'Preto, coberto de placas de metal rebitadas. Aguenta qualquer incidente.', 'rare', 130, true),
  ('m_glass', 'equip', 'rack', 'm_glass', 'PC Gamer de Vidro', 'Lateral de vidro e coolers girando em turquesa, azul e cinza-azulado.', 'epic', 180, true),
  ('m_cyber', 'equip', 'rack', 'm_cyber', 'Rack Cyberpunk', 'Cabos pendurados pelos trilhos com uma luz correndo por dentro deles.', 'epic', 220, true),
  ('m_crystal', 'equip', 'rack', 'm_crystal', 'Servidor Cristal', 'Transparente como vidro: dá para ver as placas e os LEDs lá dentro.', 'legendary', 300, true),
  ('cz_desk3', 'decor', 'furniture', 'cz_desk3', 'Mesa com 3 Monitores', 'Três telas com código rolando e uma faixa turquesa na mesa. Ocupa 2 tiles.', 'rare', 150, false),
  ('cz_arcade', 'decor', 'furniture', 'cz_arcade', 'Fliperama', 'Gabinete azul-marinho com letreiro turquesa e um jogo da cobrinha na tela.', 'epic', 140, false),
  ('cz_sign', 'decor', 'furniture', 'cz_sign', 'Placa Neon DATALAB', 'O nome do jogo em neon turquesa, piscando de leve na parede do fundo.', 'epic', 130, false),
  ('cz_fridge', 'decor', 'furniture', 'cz_fridge', 'Geladeira de Energético', 'Porta de vidro com três prateleiras de latas e um raio aceso no topo.', 'rare', 100, false),
  ('cz_sofa', 'decor', 'furniture', 'cz_sofa', 'Sofá', 'Sofá azul-marinho de dois lugares com almofadas turquesa e azul.', 'rare', 90, false),
  ('cz_chair', 'decor', 'furniture', 'cz_chair', 'Cadeira Gamer', 'Concha azul-marinho com duas listras turquesa e apoio de cabeça.', 'rare', 80, false),
  ('cz_lamp', 'decor', 'furniture', 'cz_lamp', 'Luminária Neon', 'Um anel de neon turquesa num pedestal. Ilumina o chão em volta.', 'uncommon', 60, false),
  ('cz_coffee', 'decor', 'furniture', 'cz_coffee', 'Máquina de Café', 'Café na hora, com o visor aceso e vapor saindo da xícara.', 'uncommon', 55, false),
  ('cz_codeart', 'decor', 'furniture', 'cz_codeart', 'Quadro com Código', 'Uma função emoldurada na parede, com o cursor piscando no fim.', 'uncommon', 50, false),
  ('cz_rug', 'decor', 'furniture', 'cz_rug', 'Tapete Pixel', 'Tapete 2 × 2 com borda quadriculada e o prompt >_ no meio.', 'common', 40, false),
  ('cz_plant', 'decor', 'furniture', 'cz_plant', 'Planta em Vaso', 'Folhas em tons de turquesa num vaso azul-marinho que balançam de leve.', 'common', 25, false)
)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color)
select id, category_id, slot, to_jsonb(value), name, description, rarity_id, 'gold', price, false, null, sellable, true, false, 'shop', null, null from n
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description,
  rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable,
  purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;

-- the PC / server skins are rack skins: a rack in build mode may wear one of its own (the save keeps it)
insert into public.skins (item_id, target, theme)
select id, 'rack', 'Equipamentos' from public.items where id in ('m_retro', 'm_led', 'm_armor', 'm_glass', 'm_cyber', 'm_crystal')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;

-- 3) furniture is placed, never equipped
create or replace function private.inventory_equip(p_uid uuid, p_item text) returns jsonb
language plpgsql as $$
declare it public.items; v public.inventory_items;
begin
  perform private.lock_player(p_uid);
  select * into it from public.items where id = p_item;
  select * into v from public.inventory_items where user_id = p_uid and item_id = p_item;
  if it.id is null or v.id is null then perform private.fail('not_owned', 'Você não tem este item.'); end if;
  if it.slot is null or it.slot in ('palette', 'use', 'bot', 'furniture') then perform private.fail('not_equippable', 'Este item não é equipável.'); end if;
  insert into public.equipped_items (user_id, slot, item_id, inventory_item_id) values (p_uid, it.slot, it.id, v.id)
  on conflict (user_id, slot) do update set item_id = excluded.item_id, inventory_item_id = excluded.inventory_item_id, equipped_at = now();
  if it.category_id = 'char' then
    update public.profiles set avatar = (case when jsonb_typeof(avatar) = 'object' then avatar else '{}'::jsonb end) || private.avatar_patch(it, true) where id = p_uid;
  end if;
  return private.inventory_state(p_uid);
end $$;

-- 4) the furniture as save catalog entries (build mode → Cosméticos, cosm-furniture.js): placing is free
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values
  ('cz_desk3', 'cz_desk3', null, 'cosm', 'Mesa com 3 monitores', 0),
  ('cz_arcade', 'cz_arcade', null, 'cosm', 'Fliperama', 0),
  ('cz_sign', 'cz_sign', null, 'cosm', 'Placa neon DATALAB', 0),
  ('cz_fridge', 'cz_fridge', null, 'cosm', 'Geladeira de energético', 0),
  ('cz_sofa', 'cz_sofa', null, 'cosm', 'Sofá', 0),
  ('cz_chair', 'cz_chair', null, 'cosm', 'Cadeira gamer', 0),
  ('cz_lamp', 'cz_lamp', null, 'cosm', 'Luminária neon', 0),
  ('cz_coffee', 'cz_coffee', null, 'cosm', 'Máquina de café', 0),
  ('cz_codeart', 'cz_codeart', null, 'cosm', 'Quadro com código', 0),
  ('cz_rug', 'rug_pixel', null, 'cosm', 'Tapete pixel', 0),
  ('cz_plant', 'cz_plant', null, 'cosm', 'Planta em vaso', 0)
on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;

-- 5) a save keeps a cosmetic piece only when the player owns it (the client also refuses to load one
-- that is not in the inventory: services/save-service.js)
create or replace function private.furniture_cosm_owned() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.equipment_prices p where p.id = new.def_id and p.category = 'cosm')
     and not exists (select 1 from public.inventory_items v where v.user_id = new.user_id and v.item_id = new.def_id) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists furniture_cosm_owned on public.furniture;
create trigger furniture_cosm_owned before insert or update on public.furniture
  for each row execute function private.furniture_cosm_owned();

commit;
