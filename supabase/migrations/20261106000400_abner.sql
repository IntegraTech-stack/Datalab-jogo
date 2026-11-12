-- Coleção Criador: a skin Abner (lendária, selo CRIADOR na loja; o jeito de sentar dele é o acessório
-- Relax do Criador, 20261106000500) (cosmetics.js)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('abner', 'char', 'shirt', '"abner"'::jsonb, 'Dev Abner', 'Metade deste datacenter saiu da minha cabeça. A outra metade eu resolvo sentado no chão, encostado no rack.', 'legendary', 'gold', 400, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values ('abner', 'character', 'Criador')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
