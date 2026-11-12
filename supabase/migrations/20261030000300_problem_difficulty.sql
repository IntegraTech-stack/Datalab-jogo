-- DataLab · 017 · harder career problems
-- The Pleno ranks and above have problems of difficulty 4 (muito difícil) and 5 (especialista).

alter table public.problems drop constraint if exists problems_difficulty_check;
alter table public.problems add constraint problems_difficulty_check check (difficulty between 1 and 5);
