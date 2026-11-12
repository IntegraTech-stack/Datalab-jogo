-- DataLab · Gold packs table (AbacatePay)
-- Price and coins live here (the server's truth). The AbacatePay product of each pack is found or created
-- by the "payments" function on the first checkout (externalId = sku). gold_100 already has its product
-- pinned (20261025000400): its price on the AbacatePay dashboard must be changed to R$ 5,80 as well.
insert into public.gold_packs (sku, name, coins, price_cents, tag, sort) values
  ('gold_100',   '100 Gold',   100,  580, null,           1),
  ('gold_500',   '500 Gold',   500, 1080, null,           2),
  ('gold_1000',  '1000 Gold', 1000, 2080, 'Popular',      3),
  ('gold_1500',  '1500 Gold', 1500, 3080, null,           4),
  ('gold_5000',  '5000 Gold', 5000, 5080, 'Melhor valor', 5)
on conflict (sku) do update set name = excluded.name, coins = excluded.coins, price_cents = excluded.price_cents, tag = excluded.tag, sort = excluded.sort;
