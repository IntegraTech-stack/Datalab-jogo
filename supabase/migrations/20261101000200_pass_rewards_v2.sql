-- DataLab · 020 · Passe Boot Inicial – Temporada 1: a nova lista de recompensas
-- The pass gets its own golden look and a new reward table (assets/js/battlepass.js REWARD, the same here):
--   · new rewards: profile icon "Chip Boot" (slot 'icon'), emote Reboot, pet Gato Glitch, golden circuit
--     gloves, Mochila Cooler, Capa de Cabos, Coroa de LED, Asas de Dados, Aura Boot (slot 'aura'), the
--     Grafite "BOOT" and the Trono do Servidor (furniture);
--   · out of the pass: Tapete Placa-Mãe, Luminária de LED, Máquina de Café 8-bit, Estante de Disquetes and
--     Cofre de Dados — whoever already earned one keeps it (the items stay in the catalog, never for sale);
--   · fewer Gold levels, 50 Gold each; the Rastro Arco-íris (49) and the Título Pioneiro (50) are separate.
-- Every reward stays EXCLUSIVO T1: never sold (purchasable false, price 0, sellable false), kept forever.
-- The pass is free for everyone (the activation is the game's); the XP rules (private.pass_sync) don't change.
-- New equip slots 'icon' and 'aura' (the Edge Function "inventory" accepts them for unequip).
begin;

-- 1) the rarity takes the pass' gold
update public.rarities set color = '#ffcf3f' where id = 'exclusive_t1';

-- 2) the rewards (new ones, and the new names / descriptions of the ones that stay)
with n (id, category_id, slot, value, name, description, stackable) as (values
  ('bp_frame_t1', 'pass', 'frame', 't1', 'Moldura Dourada T1', 'Moldura de perfil dourada, com cantos em pixel, pedras turquesa e um brilho que gira em volta. Aparece na Conta e na sala online.', false),
  ('bp_icon_chip', 'pass', 'icon', 'chip', 'Ícone de Perfil "Chip Boot"', 'O chip dourado do passe, com o símbolo de ligar no meio. Aparece ao lado do seu nome no jogo e na sala online.', false),
  ('bp_title_pioneer', 'pass', 'title', 'pioneer', 'Título "Pioneiro"', 'Texto dourado com um brilho passando, embaixo do seu nome no jogo e na sala online. O prêmio final do passe.', false),
  ('bp_emote_reboot', 'pass', 'emote', 'reboot', 'Reboot', 'O personagem "desliga", fica com a tela azul no rosto e "liga" de novo, com barra de carregamento. Tecla 5.', false),
  ('bp_pet_bitzero', 'char', 'pet', 'bitzero', 'BIT ZERO', 'Robozinho de tela quadrada que pisca 0 e 1 no rosto e flutua atrás de você com um jato de luz.', false),
  ('bp_pet_glitchcat', 'char', 'pet', 'glitchcat', 'Gato Glitch', 'Gatinho em pixel que de vez em quando "falha": treme e muda de cor.', false),
  ('bp_glasses001', 'char', 'face', 'g001', 'Óculos 001', 'Óculos escuros com "001" dourado passando nas lentes.', false),
  ('bp_gloves_t1', 'char', 'hands', 'gloves_t1', 'Luvas de Circuito Douradas', 'Luvas pretas com linhas de circuito douradas que acendem uma depois da outra.', false),
  ('bp_cooler', 'char', 'back', 'cooler', 'Mochila Cooler', 'Mochila preta com uma ventoinha girando nas costas e um LED piscando.', false),
  ('bp_cable_cape', 'char', 'back', 'cablecape', 'Capa de Cabos', 'Uma capa feita de fios coloridos que balançam quando você anda.', false),
  ('bp_led_crown', 'char', 'head', 'ledcrown', 'Coroa de LED', 'Coroa dourada com LEDs coloridos que acendem em sequência.', false),
  ('bp_data_wings', 'char', 'back', 'datawings', 'Asas de Dados', 'Asas feitas de pixels de código turquesa e dourado, que batem devagar.', false),
  ('bp_aura_boot', 'pass', 'aura', 'boot', 'Aura Boot', 'Partículas douradas sobem em volta do personagem, com um anel de luz nos pés. Os outros jogadores veem na sala online.', false),
  ('bp_skin_founder', 'char', 'shirt', 'bp_founder', 'Skin Fundador', 'Sobretudo longo preto com forro dourado e gola alta, "001" pulsando nas costas, olhos turquesa, luvas e botas douradas. A barra balança quando você anda.', false),
  ('bp_relic', 'equip', 'rack', 'm_relic', 'Servidor Relíquia', 'Gabinete antigo, bege e rachado, com luz dourada saindo pelas rachaduras: o primeiro servidor do mundo.', false),
  ('bp_trail_binary', 'trail', 'trail', 'binary', 'Rastro Binário', 'Zeros e uns dourados e turquesa caem do ar, pousam onde você pisou e brilham.', false),
  ('bp_trail_sparks', 'trail', 'trail', 'sparks', 'Rastro de Faíscas', 'Faíscas elétricas douradas pulam a cada passo, com um raio estalando no chão.', false),
  ('bp_trail_cables', 'trail', 'trail', 'cables', 'Rastro de Cabos', 'Fios coloridos que serpenteiam pelo chão atrás de você, aparecem e somem.', false),
  ('bp_trail_ghost', 'trail', 'trail', 'ghost', 'Rastro Fantasma', 'Pegadas azuis meio transparentes, com fantasminhas de luz subindo delas.', false),
  ('bp_trail_code', 'trail', 'trail', 'code', 'Rastro de Código', 'Letras de código turquesa e douradas sobem do chão como uma tela rolando.', false),
  ('bp_trail_glitch', 'trail', 'trail', 'glitch', 'Rastro Glitch', 'O chão "falha" e treme em faixas de cor onde o personagem pisa.', false),
  ('bp_trail_rainbow', 'trail', 'trail', 'rainbow', 'Rastro Arco-íris Pixel', 'Uma faixa de arco-íris em pixel que ondula atrás de você, cheia de brilhos.', false),
  ('bp_hello', 'decor', 'furniture', 'bp_hello', 'Quadro "Hello World"', 'Na parede: o primeiro programa de todo mundo, numa moldura dourada, com o cursor piscando. 2 tiles.', false),
  ('bp_graffiti', 'decor', 'furniture', 'bp_graffiti', 'Grafite "BOOT"', 'Na parede: "BOOT" pichado em neon dourado, com a tinta escorrendo. 2 tiles.', false),
  ('bp_founder_chair', 'decor', 'furniture', 'bp_founder_chair', 'Cadeira do Fundador', 'Cadeira gamer preta com detalhes dourados e o selo 001 no encosto.', false),
  ('bp_hacker_desk', 'decor', 'furniture', 'bp_hacker_desk', 'Mesa Hacker', 'Mesa com 3 monitores com código rolando e teclado aceso. 2 tiles.', false),
  ('bp_crt_terminal', 'decor', 'furniture', 'bp_crt_terminal', 'Terminal de Tubo', 'Computador antigo de tela verde, com chiado na tela e o prompt piscando.', false),
  ('bp_arcade_boot', 'decor', 'furniture', 'bp_arcade_boot', 'Fliperama Boot', 'Fliperama com o logo do DataLab no letreiro e um joguinho animado na tela.', false),
  ('bp_server_throne', 'decor', 'furniture', 'bp_server_throne', 'Trono do Servidor', 'Um trono feito de racks, com luzes piscando nos braços e no encosto.', false),
  ('bp_neon_boot', 'decor', 'furniture', 'bp_neon_boot', 'Placa Neon "BOOT 001"', 'Letreiro neon dourado e turquesa para pendurar na parede. 2 tiles.', false)
)
insert into public.items (id, category_id, slot, value, name, description, rarity_id, currency_id, price, stackable, max_quantity, sellable, purchasable, gift, grant_type, event_id, color)
select id, category_id, slot, to_jsonb(value), name, description, 'exclusive_t1', 'gold', 0, stackable, null, false, false, false, 'reward', null, null from n
on conflict (id) do update set category_id = excluded.category_id, slot = excluded.slot, value = excluded.value, name = excluded.name, description = excluded.description,
  rarity_id = excluded.rarity_id, price = excluded.price, stackable = excluded.stackable, max_quantity = excluded.max_quantity, sellable = excluded.sellable,
  purchasable = excluded.purchasable, gift = excluded.gift, grant_type = excluded.grant_type, event_id = excluded.event_id, color = excluded.color, active = true;

-- the new furniture as save catalog entries (build mode → Cosméticos), free to place for whoever owns it
insert into public.equipment_prices (id, kind, unit_kind, category, name, price) values
  ('bp_graffiti', 'bp_graffiti', null, 'cosm', 'Grafite BOOT', 0),
  ('bp_server_throne', 'bp_server_throne', null, 'cosm', 'Trono do Servidor', 0)
on conflict (id) do update set kind = excluded.kind, unit_kind = excluded.unit_kind, category = excluded.category, name = excluded.name, price = excluded.price;

-- 3) the new reward table: one reward per level, 50 Gold on the 15 levels without an item
delete from public.pass_rewards where season_id = 's1';
insert into public.pass_rewards (season_id, level, items, gold)
select 's1', l, coalesce(r.items, '{}'), case when r.items is not null then 0 else 50 end
from generate_series(1, 50) l
left join (values
  (1, array['bp_frame_t1']), (3, array['bp_hello']), (4, array['bp_icon_chip']), (5, array['bp_trail_binary']), (7, array['bp_graffiti']),
  (9, array['bp_glasses001']), (10, array['bp_pet_bitzero']), (12, array['bp_gloves_t1']), (13, array['bp_xp2']), (14, array['bp_trail_sparks']),
  (15, array['bp_emote_reboot']), (17, array['bp_cooler']), (18, array['bp_term_boot']), (20, array['bp_emote_hack']), (22, array['bp_hacker_desk']),
  (23, array['bp_trail_cables']), (25, array['bp_xp2']), (26, array['bp_pet_glitchcat']), (27, array['bp_founder_chair']), (29, array['bp_cable_cape']),
  (30, array['bp_relic']), (32, array['bp_trail_ghost']), (33, array['bp_crt_terminal']), (35, array['bp_xp2']), (36, array['bp_arcade_boot']),
  (37, array['bp_led_crown']), (39, array['bp_data_wings']), (40, array['bp_trail_code']), (42, array['bp_server_throne']), (43, array['bp_trail_glitch']),
  (45, array['bp_neon_boot']), (46, array['bp_aura_boot']), (48, array['bp_skin_founder']), (49, array['bp_trail_rainbow']), (50, array['bp_title_pioneer'])
) as r (lv, items) on r.lv = l;

commit;
