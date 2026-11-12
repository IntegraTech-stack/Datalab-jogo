-- DataLab · Passe Boot Inicial – Temporada 1: o XP guardado chega inteiro na primeira sincronização
-- The Edge Function "pass" was not deployed, so no account has a pass row yet: every player's pass XP waited
-- in the browser. A new row used to start with 10 minutes of allowance (private.pass_sync accepts at most
-- 150 XP a minute since synced_at) — the first sync would drop almost all of it. A new row now starts with
-- the 3 hours pass_sync already allows at most (180 minutes, ~27 000 XP). The cap itself does not change,
-- and rewards stay once per level (pass_sync gives levels bp.level + 1 .. new_level and skips owned items).
begin;

create or replace function private.pass_row(p_uid uuid, p_season text) returns public.battle_passes
language plpgsql as $$
declare bp public.battle_passes;
begin
  insert into public.battle_passes (user_id, season_id, synced_at) values (p_uid, p_season, now() - interval '180 minutes')
  on conflict (user_id, season_id) do nothing;
  select * into bp from public.battle_passes where user_id = p_uid and season_id = p_season for update;
  return bp;
end $$;

revoke all on function private.pass_row(uuid, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on function private.pass_row(uuid, text) from anon, authenticated; end if;
end $$;

commit;
