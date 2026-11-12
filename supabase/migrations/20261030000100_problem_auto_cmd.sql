-- DataLab · 016 · career problems of the Júnior ranks
-- The Júnior problems show fewer commands: a step may have no expected_cmd (the hint the player sees) and keep
-- in auto_cmd what the development auto-play types for it (one command per line; never shown in the game).
-- The Windows help cards now go to command_help too (os = 'win'), so steps on a Windows Server can point at them.

alter table public.scenario_steps add column if not exists auto_cmd text;
