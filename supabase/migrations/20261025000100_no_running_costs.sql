-- DataLab · 009 · no running costs
-- The company only loses money when the player buys something (equipment, land, a hire). The game no
-- longer charges salaries or infrastructure, so the save must not charge a payroll floor either:
-- opex_floor = 0 turns off the minimum operating cost in private.game_save (purchases and hires are
-- still priced by the server as before).
update public.game_config
   set value = jsonb_set(value, '{opex_floor}', '0'::jsonb), updated_at = now()
 where key = 'economy';
