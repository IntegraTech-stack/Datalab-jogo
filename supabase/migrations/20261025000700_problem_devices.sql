-- DataLab · 015 · career problems on more than one device
-- A problem may involve other equipment besides its main one (devices: { "sw": "switch.of" } — the switch at
-- the other end of the server's cable); each step says on which one it happens (device_role, null = the main
-- one). bot_action 'fix': when a crew member takes the problem, they also fix the fault the setup created.

alter table public.problems add column if not exists devices jsonb not null default '{}'::jsonb;
alter table public.problems add column if not exists bot_action text;
alter table public.scenario_steps add column if not exists device_role text;

do $$ begin
  alter table public.problems add constraint problems_devices check (jsonb_typeof(devices) = 'object');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.problems add constraint problems_bot_action check (bot_action is null or bot_action in ('fix'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.scenario_steps add constraint scenario_steps_device check (device_role is null or device_role ~ '^[a-z]{2,8}$');
exception when duplicate_object then null; end $$;
