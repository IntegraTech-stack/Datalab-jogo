-- DataLab · 011 · no starter kit
-- The game no longer gives anything for free at the start: the first rack, computer, server, switch,
-- patch panel, hire, configuration and land expansion are paid like everything else (economy.js
-- starterKit = {}). The server must agree, or private.game_save would price those items at 0 and the
-- cash it answers with would not match the game.
update public.game_config
   set value = jsonb_set(value, '{starter_kit}', '{}'::jsonb), updated_at = now()
 where key = 'economy';

-- companies that still had part of the kit left lose it (nothing else changes)
update public.companies set starter_kit = '{}'::jsonb where starter_kit <> '{}'::jsonb;
