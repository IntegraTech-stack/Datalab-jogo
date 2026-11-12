-- Coleção Criador: a skin Tiago (lendária, selo CRIADOR na loja, cyber security; traz os emotes Firewall e
-- Bloqueio, teclas 8 e 9) (cosmetics.js, emotes.js)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('tiago', 'char', 'shirt', '"tiago"'::jsonb, 'Dev Tiago', 'Ninguém entra neste datacenter sem eu saber. Pode tentar: eu já vi o pacote antes dele sair (teclas 8 e 9).', 'legendary', 'gold', 400, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values ('tiago', 'character', 'Criador')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
