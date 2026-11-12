-- Coleção Criador: a skin Dev Pierre (lendária, selo CRIADOR na loja, traz o emote Selfie) e os óculos
-- Wayfarer do Criador, acessório de rosto que se põe e tira à parte (cosmetics.js)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('dev_pierre', 'char', 'shirt', '"dev_pierre"'::jsonb, 'Dev Pierre', 'Eu construí este datacenter linha por linha. Agora venho conferir de perto, de mão no bolso e com selfie no espelho (tecla 6).', 'legendary', 'gold', 400, false, null, true, true, false, 'shop', null, null),
  ('gear_wayfarer', 'char', 'face', '"wayfarer"'::jsonb, 'Wayfarer do Criador', 'Armação preta, lentes marrom-alaranjadas e um reflexo que passa de vez em quando. Põe e tira quando quiser.', 'epic', 'gold', 90, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values
  ('dev_pierre', 'character', 'Criador'), ('gear_wayfarer', 'character', 'Criador')
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
