-- DataLab · 012 · AbacatePay product of the 100 Gold pack
-- The product was created by hand in the AbacatePay dashboard (R$ 4,00). Pinning its id here stops the
-- "payments" function from looking it up by externalId and creating a duplicate product.
update public.gold_packs set provider_product_id = 'prod_DK23A3Kz3Dqt5PQMASbj6kPK' where sku = 'gold_100';
