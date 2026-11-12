-- DataLab · 021 · Passe Boot Inicial – Temporada 1: o Rastro Relâmpago no lugar do Rastro de Cabos
-- Level 23 of the pass now gives the Rastro Relâmpago (bp_trail_bolt, value 'bolt', assets/js/trails.js):
-- little golden zigzag bolts leaping out of the feet, gone in a second, a turquoise spark now and then.
-- Whoever already had the Rastro de Cabos gets the Rastro Relâmpago in its place, equipped if it was
-- (the game does the same in a browser's own save: cosmetics.js DL.RENAMED_COSMETICS, inventory.js).
-- The old item leaves every inventory and the catalog (kept inactive: old transactions point to it).
begin;

-- 1) the new reward (EXCLUSIVO T1: never sold, kept forever)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color)
values ('bp_trail_bolt', 'trail', 'trail', to_jsonb('bolt'::text), 'Rastro Relâmpago', 'Raios dourados em zigue-zague saltam dos seus pés, piscam e somem num instante, com uma faísca turquesa de vez em quando.',
  'exclusive_t1', 'gold', 0, false, null, false, false, false, 'reward', null, null)
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description,
  rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable,
  purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;

-- 2) the pass' level 23
update public.pass_rewards set items = array_replace(items, 'bp_trail_cables', 'bp_trail_bolt') where season_id = 's1' and 'bp_trail_cables' = any (items);

-- 3) whoever had the Rastro de Cabos: the Rastro Relâmpago, from the same source and date
insert into public.inventory_items (user_id, item_id, quantity, source, event_id, first_acquired_at)
  select v.user_id, 'bp_trail_bolt', 1, v.source, v.event_id, v.first_acquired_at from public.inventory_items v where v.item_id = 'bp_trail_cables'
  on conflict (user_id, item_id) do nothing;
insert into public.transactions (user_id, item_id, amount, kind, description, ref)
  select v.user_id, 'bp_trail_bolt', 1, 'grant', 'Rastro Relâmpago no lugar do Rastro de Cabos', jsonb_build_object('migration', 'trail_bolt')
  from public.inventory_items v where v.item_id = 'bp_trail_cables';

-- 4) equipped: the new one stays on
update public.equipped_items e set item_id = 'bp_trail_bolt', inventory_item_id = v.id, equipped_at = now()
  from public.inventory_items v
  where e.item_id = 'bp_trail_cables' and v.user_id = e.user_id and v.item_id = 'bp_trail_bolt';

-- 5) the old one leaves every inventory (any equip left goes with it: FK on delete cascade) and the catalog
delete from public.inventory_items where item_id = 'bp_trail_cables';
update public.items set active = false, purchasable = false where id = 'bp_trail_cables';

commit;
