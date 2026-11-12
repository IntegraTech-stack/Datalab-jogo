-- DataLab · 014 · career problems
-- Catalog (read-only for everyone, filled by seed_scenarios.sql — generated from assets/js/problems-data.js):
--   career_ranks · command_help · scenario_lessons · problems · scenario_steps · scenario_step_help
-- Per save: problem_runs (what was solved, by whom, for how much XP) and the career XP / level the server
-- allows (game_saves.career_xp / career_level). Steps keep their checks as JSON (check_rule / answer):
-- the game reads them with a fixed list of probes, nothing in them is ever executed.

-- ---------------------------------------------------------------------------
-- catalog
-- ---------------------------------------------------------------------------
create table if not exists public.career_ranks (
  id text primary key check (id ~ '^[a-z0-9_]{2,16}$'),
  level smallint not null unique check (level between 1 and 20),
  name text not null,
  xp_to_next integer check (xp_to_next is null or xp_to_next > 0),      -- XP the rank asks for besides its mission
  distinct_to_next smallint not null default 0 check (distinct_to_next >= 0)
);

-- the cards of "Precisa de ajuda?" (os: null = Linux / switch, 'win' = Windows Server)
create table if not exists public.command_help (
  key text primary key check (key ~ '^[a-z0-9-]{2,40}$'),
  cmd text not null,
  example text not null,
  what text not null,
  when_to_use text not null,
  os text check (os in ('win')),
  sort smallint not null default 0
);

-- lessons the game opens for a fault or a new server (setup, link, cable, service, disk, port)
create table if not exists public.scenario_lessons (
  id text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  title text not null,
  goal text not null,
  vars jsonb not null default '{}'::jsonb
);

create table if not exists public.problems (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  n smallint not null,                                            -- the number in the list of the rank
  rank_id text not null references public.career_ranks (id),
  title text not null,
  summary text not null,
  handoff text,                                                   -- who continues after the player answers
  difficulty smallint not null check (difficulty between 1 and 3),
  xp integer not null check (xp between 1 and 1000),
  credits integer not null default 0 check (credits between 0 and 100),
  skill text not null check (skill in ('redes', 'servidores', 'sistemas', 'seguranca', 'gestao')),
  roles text[] not null default '{}',                             -- crew roles that can take it
  bot_minutes smallint not null default 10 check (bot_minutes between 1 and 240),
  weight numeric(4, 2) not null default 1 check (weight > 0),
  trigger_kind text not null default 'random' check (trigger_kind in ('random', 'auto')),
  complete text not null check (complete in ('lesson', 'fixed', 'online', 'steps')),
  lesson_id text references public.scenario_lessons (id),         -- fixed / online: the lesson of that fault / new server
  when_rule text check (when_rule ~ '^[a-zA-Z]{2,32}$'),
  target jsonb not null,                                          -- the equipment it happens on (selector)
  setup jsonb,                                                    -- what goes wrong when it starts
  vars jsonb not null default '{}'::jsonb,                        -- values read when it starts
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint problems_lesson check ((complete in ('fixed', 'online')) = (lesson_id is not null)),
  constraint problems_target check (jsonb_typeof(target) = 'object' and target ? 'kind')
);
create index if not exists problems_rank_idx on public.problems (rank_id);

-- steps of a lesson or of a problem: a command (check_rule says when it is done) or a question (answer)
create table if not exists public.scenario_steps (
  id bigint generated always as identity primary key,
  lesson_id text references public.scenario_lessons (id) on delete cascade,
  problem_id text references public.problems (id) on delete cascade,
  ord smallint not null check (ord between 0 and 30),
  step_type text not null default 'command' check (step_type in ('command', 'answer')),
  text text not null,
  expected_cmd text,                                              -- the hint ("experimente …")
  action text check (action in ('cabling', 'build')),
  check_rule jsonb,
  answer jsonb,
  constraint scenario_steps_owner check ((lesson_id is null) <> (problem_id is null)),
  constraint scenario_steps_kind check (case when step_type = 'answer' then answer is not null and jsonb_typeof(answer -> 'accept') = 'array' else check_rule is not null end),
  unique (lesson_id, ord),
  unique (problem_id, ord)
);

-- the help cards of each step (in order)
create table if not exists public.scenario_step_help (
  step_id bigint not null references public.scenario_steps (id) on delete cascade,
  help_key text not null references public.command_help (key),
  sort smallint not null default 0,
  primary key (step_id, help_key)
);

-- ---------------------------------------------------------------------------
-- per save
-- ---------------------------------------------------------------------------
create table if not exists public.problem_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  datacenter_id uuid not null references public.datacenters (id) on delete cascade,
  problem_id text not null references public.problems (id),
  resolved_by text not null check (resolved_by in ('player', 'crew')),
  xp integer not null default 0 check (xp >= 0),
  wrong_answers smallint not null default 0 check (wrong_answers >= 0),
  created_at timestamptz not null default now()
);
create index if not exists problem_runs_dc_idx on public.problem_runs (datacenter_id, problem_id);
create index if not exists problem_runs_user_idx on public.problem_runs (user_id, created_at desc);

alter table public.game_saves add column if not exists career_xp bigint not null default 0 check (career_xp >= 0);
alter table public.game_saves add column if not exists career_level smallint not null default 1 check (career_level between 1 and 20);
-- saves from before this migration keep the level they had (the XP gate only applies to promotions from now on)
update public.game_saves set career_level = least(20, greatest(1, coalesce((data -> 'career' ->> 'level')::int, 1)))
 where data is not null and jsonb_typeof(data -> 'career') = 'object' and career_level = 1;

-- ---------------------------------------------------------------------------
-- security: the catalog is public read-only, runs are the player's own (same rules as 005)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  has_roles boolean := exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon');
begin
  foreach t in array array['career_ranks', 'command_help', 'scenario_lessons', 'problems', 'scenario_steps', 'scenario_step_help', 'problem_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    if has_roles then execute format('revoke all on public.%I from anon, authenticated', t); end if;
  end loop;
  foreach t in array array['career_ranks', 'command_help', 'scenario_lessons', 'problems', 'scenario_steps', 'scenario_step_help'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    if has_roles then execute format('grant select on public.%I to anon, authenticated', t); end if;
  end loop;
  drop policy if exists problem_runs_own on public.problem_runs;
  create policy problem_runs_own on public.problem_runs for select to authenticated using (user_id = (select auth.uid()));
  if has_roles then grant select on public.problem_runs to authenticated; end if;
end $$;

-- ---------------------------------------------------------------------------
-- career on save: price the solved problems with the server's catalog, cap the XP, gate promotions
-- ---------------------------------------------------------------------------
-- p_career: the save's career snapshot · p_runs: [{ id, by: 'player' | 'crew', wrong }] solved since the last save
-- p_mins: game minutes this save covers, already bounded by real time in game_save
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
    return jsonb_build_object('xp', sv.career_xp + gained, 'level', sv.career_level, 'gained', gained, 'runs', counted, 'clamped', false);
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
  return jsonb_build_object('xp', new_xp, 'level', new_level, 'gained', gained, 'runs', counted, 'clamped', clamped or new_xp < claimed_xp);
end $$;

-- the save the Edge Function "game" calls: economy (game_save) + career, in one transaction
create or replace function private.game_save_career(p_uid uuid, p_slot integer, p_data jsonb, p_claim jsonb, p_request uuid) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := private.game_save(p_uid, p_slot, p_data, p_claim, p_request);
  return r || jsonb_build_object('career', private.career_settle(p_uid, p_slot, p_data -> 'career', p_claim -> 'problems',
    coalesce((r -> 'charged' ->> 'minutes')::numeric, 0)));
end $$;

-- nobody but the database owner (the Edge Functions' connection) runs these
do $$ begin
  revoke all on function private.career_settle(uuid, integer, jsonb, jsonb, numeric) from public;
  revoke all on function private.game_save_career(uuid, integer, jsonb, jsonb, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.career_settle(uuid, integer, jsonb, jsonb, numeric) from anon, authenticated;
    revoke all on function private.game_save_career(uuid, integer, jsonb, jsonb, uuid) from anon, authenticated;
  end if;
end $$;
