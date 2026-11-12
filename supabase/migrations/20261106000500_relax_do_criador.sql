-- Coleção Criador: o acessório Relax do Criador (slot 'pose'): senta relaxado, de pernas abertas e braço no
-- encosto, nos sofás e encostado nos racks, com qualquer skin (cosmetics.js). Equipar e tirar não muda nada
-- no servidor: private.inventory_equip aceita o slot novo como os outros acessórios.
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('gear_lounge', 'char', 'pose', '"lounge"'::jsonb, 'Relax do Criador', 'Pernas abertas e braço no encosto: senta assim nos sofás e no chão, encostado no rack. Põe e tira quando quiser.', 'epic', 'gold', 90, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values ('gear_lounge', 'character', 'Criador')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
