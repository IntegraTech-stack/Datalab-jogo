-- Career: XP from events (blackout, fire) counts on the server too.
-- The game gives XP for the blackout's breaker (blackout.js / disjuntor.js) and for fires (incendio.js). Those are
-- not rows of public.problems, so career_settle ignored them: the save's XP was cut back at every save and a
-- promotion that leaned on that XP was refused. Now the game sends them in claim.problems (with the XP it gave)
-- and the server accepts them, capped per event and by the same pace as the problems (max_runs).
-- The answer carries v = 2 so the game knows events are counted (assets/js/economy.js → requeueProblems).
-- Only the function changes: no table, no data.

create or replace function private.career_settle(p_uid uuid, p_slot integer, p_career jsonb, p_runs jsonb, p_mins numeric) returns jsonb
language plpgsql as $$
declare
  sv public.game_saves; run jsonb; pb public.problems; rk public.career_ranks;
  prior integer; share numeric; xp integer; gained bigint := 0; counted integer := 0;
  -- solving takes real time: one problem per 20 game minutes (+1) at most
  max_runs integer := least(20, floor(greatest(coalesce(p_mins, 0), 0) / 20)::int + 1);
  claimed_xp bigint; new_xp bigint; claimed_level integer; new_level integer; distinct_n integer;
  clamped boolean := false; car jsonb;
begin
  select * into sv from public.game_saves where user_id = p_uid and slot = p_slot for update;
  if not found then return null; end if;

  -- what was solved, priced by the catalog: repeats in this save are worth half, then a quarter;
  -- the crew solving for the player (an order) gives 15%
  for run in select r from jsonb_array_elements(case when jsonb_typeof(p_runs) = 'array' then p_runs else '[]'::jsonb end) r limit 30 loop
    exit when counted >= max_runs;
    -- events that are not catalog problems (the blackout's breaker, a damaged server redone, a fire put out,
    -- burnt equipment recovered): the game says how much it gave (repeats are worth less there), capped here
    if run ->> 'id' in ('apagao_disjuntor', 'apagao_servidor', 'incendio_apagado', 'incendio_equipamento') then
      xp := least(case run ->> 'id' when 'apagao_disjuntor' then 25 when 'apagao_servidor' then 15 when 'incendio_apagado' then 30 else 20 end,
                  case when run ->> 'xp' ~ '^[0-9]{1,4}$' then (run ->> 'xp')::int else 0 end);
      gained := gained + xp;
      counted := counted + 1;
      continue;
    end if;
    select * into pb from public.problems where id = run ->> 'id' and active;
    continue when not found;
    share := case when run ->> 'by' = 'player' then 1 else 0.15 end;
    select count(*) into prior from public.problem_runs where datacenter_id = sv.datacenter_id and problem_id = pb.id;
    xp := greatest(1, round(pb.xp * (case when prior = 0 then 1 when prior = 1 then 0.5 else 0.25 end) * share))::int;
    insert into public.problem_runs (user_id, datacenter_id, problem_id, resolved_by, xp, wrong_answers)
    values (p_uid, sv.datacenter_id, pb.id, case when share = 1 then 'player' else 'crew' end, xp,
            least(999, greatest(0, coalesce((run ->> 'wrong')::int, 0))));
    gained := gained + xp;
    counted := counted + 1;
  end loop;

  if p_career is null or jsonb_typeof(p_career) <> 'object' then
    update public.game_saves set career_xp = career_xp + gained where id = sv.id;
    return jsonb_build_object('xp', sv.career_xp + gained, 'level', sv.career_level, 'gained', gained, 'runs', counted, 'clamped', false, 'v', 2);
  end if;

  -- XP: never more than the server has seen solved
  claimed_xp := greatest(0, coalesce((p_career ->> 'xp')::bigint, sv.career_xp));
  new_xp := least(claimed_xp, sv.career_xp + gained);
  -- level: a promotion past a rank that asks for XP needs that XP and that many different problems
  claimed_level := least(20, greatest(1, coalesce((p_career ->> 'level')::int, 1)));
  new_level := claimed_level;
  if claimed_level > sv.career_level then
    select count(distinct problem_id) into distinct_n from public.problem_runs where datacenter_id = sv.datacenter_id and resolved_by = 'player';
    for rk in select * from public.career_ranks where xp_to_next is not null and level >= sv.career_level and level < claimed_level order by level loop
      if new_xp < rk.xp_to_next or distinct_n < rk.distinct_to_next then new_level := rk.level; clamped := true; exit; end if;
    end loop;
  end if;

  car := p_career || jsonb_build_object('xp', new_xp, 'level', new_level,
           'lvlXp', least(greatest(0, coalesce((p_career ->> 'lvlXp')::bigint, 0)), new_xp));
  if clamped then car := car || jsonb_build_object('done', false); end if;
  update public.game_saves set career_xp = new_xp, career_level = new_level,
    data = case when data is null then data else jsonb_set(data, '{career}', car) end
  where id = sv.id;
  return jsonb_build_object('xp', new_xp, 'level', new_level, 'gained', gained, 'runs', counted, 'clamped', clamped or new_xp < claimed_xp, 'v', 2);
end $$;

do $$ begin
  revoke all on function private.career_settle(uuid, integer, jsonb, jsonb, numeric) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.career_settle(uuid, integer, jsonb, jsonb, numeric) from anon, authenticated;
  end if;
end $$;
