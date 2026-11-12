-- Coleção Criador: a skin João Pedro (lendária, selo CRIADOR na loja, traz o emote Ping) e o acessório
-- Notebook de Redes (slot 'hands': fechado debaixo do braço andando, aberto com código verde parado),
-- que se põe e tira à parte (cosmetics.js)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('joao_pedro', 'char', 'shirt', '"joao_pedro"'::jsonb, 'Dev João Pedro', 'Cada cabo deste datacenter passou pela minha mão. Se o pacote chegou, é porque eu deixei (tecla 7).', 'legendary', 'gold', 400, false, null, true, true, false, 'shop', null, null),
  ('gear_netbook', 'char', 'hands', '"netbook"'::jsonb, 'Notebook de Redes', 'Fechado debaixo do braço quando você anda; parado, abre e o código verde começa a rolar. Põe e tira quando quiser.', 'epic', 'gold', 90, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values
  ('joao_pedro', 'character', 'Criador'), ('gear_netbook', 'character', 'Criador')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
