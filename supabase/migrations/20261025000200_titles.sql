-- DataLab · 010 · player titles
-- Titles are badges shown next to the player's name (menu, account, in-game nametag). Staff roles give
-- theirs automatically in the client (admin → Admin, developer → Dev, moderator → Moderador); the titles
-- below are granted by staff and carry no permission at all (unlike user_roles).
-- Never writable from the browser: only private.admin_set_title, through the "admin" Edge Function.

create table if not exists public.user_titles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (title in ('founder', 'beta', 'creator', 'supporter', 'vip')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, title)
);

-- read only your own (same rule as user_roles in 0500)
alter table public.user_titles enable row level security;
drop policy if exists user_titles_own on public.user_titles;
create policy user_titles_own on public.user_titles for select to authenticated using (user_id = (select auth.uid()));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.user_titles from anon, authenticated;
    grant select on public.user_titles to authenticated;
  end if;
end $$;

-- admins and developers hand out titles
create or replace function private.admin_set_title(p_actor uuid, p_target uuid, p_title text, p_on boolean) returns jsonb
language plpgsql as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão para mudar títulos.'); end if;
  if p_title not in ('founder', 'beta', 'creator', 'supporter', 'vip') then perform private.fail('bad_title', 'Título inválido.'); end if;
  if not exists (select 1 from public.profiles where id = p_target) then perform private.fail('user_not_found', 'Jogador não encontrado.'); end if;
  if p_on then
    insert into public.user_titles (user_id, title, granted_by) values (p_target, p_title, p_actor) on conflict do nothing;
  else
    delete from public.user_titles where user_id = p_target and title = p_title;
  end if;
  return coalesce((select jsonb_agg(title) from public.user_titles where user_id = p_target), '[]');
end $$;

-- player search now also returns the titles
create or replace function private.admin_find_users(p_actor uuid, p_query text) returns jsonb
language plpgsql stable as $$
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'created_at', p.created_at,
      'roles', coalesce((select jsonb_agg(role) from public.user_roles r where r.user_id = p.id), '[]'),
      'titles', coalesce((select jsonb_agg(title) from public.user_titles t where t.user_id = p.id), '[]')) order by p.username)
    from (select * from public.profiles where p_query is null or char_length(p_query) < 2 or username ilike '%' || replace(replace(p_query, '%', ''), '_', '\_') || '%' or id::text = p_query limit 25) p), '[]');
end $$;

do $$ begin
  revoke all on function private.admin_set_title(uuid, uuid, text, boolean) from public;
  revoke all on function private.admin_find_users(uuid, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.admin_set_title(uuid, uuid, text, boolean) from anon, authenticated;
    revoke all on function private.admin_find_users(uuid, text) from anon, authenticated;
  end if;
end $$;
