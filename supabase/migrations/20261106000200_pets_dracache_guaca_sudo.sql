-- Pets novos da loja: Drácache, Guaca.exe e Sudo (cosmetics.js)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color) values
  ('pet_dracache', 'char', 'pet', '"dracache"'::jsonb, 'Drácache', 'Morcego roxo de olhos de LED que cochila de cabeça para baixo nos racks.', 'epic', 'gold', 150, false, null, true, true, false, 'shop', null, null),
  ('pet_guaca', 'char', 'pet', '"guaca"'::jsonb, 'Guaca.exe', 'Abacate de bracinhos curtos que anda como quem acabou de aprender.', 'common', 'gold', 50, false, null, true, true, false, 'shop', null, null),
  ('pet_sudo', 'char', 'pet', '"sudo"'::jsonb, 'Sudo', 'Gato preto de fone LED que só obedece quando você pede com sudo.', 'rare', 'gold', 85, false, null, true, true, false, 'shop', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description, rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable, purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;
insert into public.skins (item_id, target, theme) values
  ('pet_dracache', 'character', null), ('pet_guaca', 'character', null), ('pet_sudo', 'character', null)
on conflict (item_id) do update set target = excluded.target, theme = excluded.theme;
