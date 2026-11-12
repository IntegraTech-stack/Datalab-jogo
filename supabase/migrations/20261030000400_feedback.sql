-- DataLab · 017 · community ideas and bug reports
-- Ideas: any player suggests one, everyone likes the ones they want; the most liked go into the next
-- update (staff move them open → planned → done, or rejected). One like per player per idea, the count
-- is kept on the idea row (updated under a row lock, so two likes at once never lose one).
-- Bugs: a message plus an optional screenshot. The image lives in private.bug_screenshots (off the
-- public API) and only its author and the staff can see it.
-- Nothing here is readable or writable from the browser: everything goes through the "feedback" Edge
-- Function, which calls the private.* functions below with the user id taken from the JWT.

create table if not exists public.ideas (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 6 and 80),
  body text not null default '' check (char_length(body) <= 1000),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'rejected')),
  likes integer not null default 0 check (likes >= 0),
  staff_note text check (staff_note is null or char_length(staff_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ideas_rank on public.ideas (status, likes desc, created_at);
create index if not exists ideas_user on public.ideas (user_id, created_at desc);
drop trigger if exists ideas_touch on public.ideas;
create trigger ideas_touch before update on public.ideas for each row execute function private.touch_updated_at();

create table if not exists public.idea_likes (
  idea_id bigint not null references public.ideas (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index if not exists idea_likes_user on public.idea_likes (user_id);

create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 10 and 2000),
  -- where it happened (menu / in game, preset, screen size, browser): filled by the Edge Function
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) < 4096),
  status text not null default 'new' check (status in ('new', 'confirmed', 'fixed', 'invalid')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 300),
  has_shot boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bug_reports_status on public.bug_reports (status, created_at desc);
create index if not exists bug_reports_user on public.bug_reports (user_id, created_at desc);
drop trigger if exists bug_reports_touch on public.bug_reports;
create trigger bug_reports_touch before update on public.bug_reports for each row execute function private.touch_updated_at();

-- the screenshot (JPEG re-encoded in the browser, which also drops EXIF): 1 MB at most
create table if not exists private.bug_screenshots (
  bug_id bigint primary key references public.bug_reports (id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) <= 1048576)
);

-- RLS on, no grants: the browser never touches these tables directly
alter table public.ideas enable row level security;
alter table public.idea_likes enable row level security;
alter table public.bug_reports enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ideas, public.idea_likes, public.bug_reports from anon, authenticated;
    revoke all on private.bug_screenshots from anon, authenticated;
  end if;
end $$;

/* ---------------- ideas ---------------- */

create or replace function private.idea_json(p_uid uuid, i public.ideas) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', i.id, 'title', i.title, 'body', i.body, 'status', i.status, 'likes', i.likes,
    'staff_note', i.staff_note, 'created_at', i.created_at,
    'author', (select username from public.profiles where id = i.user_id),
    'mine', i.user_id = p_uid,
    'liked', exists (select 1 from public.idea_likes l where l.idea_id = i.id and l.user_id = p_uid));
$$;

-- p_tab: open (voting) | planned (next update) | done (in the game) | mine; p_sort: top | new (open only)
create or replace function private.ideas_list(p_uid uuid, p_tab text, p_sort text) returns jsonb
language plpgsql stable as $$
declare res jsonb;
begin
  if p_tab not in ('open', 'planned', 'done', 'mine') then perform private.fail('bad_tab', 'Lista inválida.'); end if;
  select coalesce(jsonb_agg(private.idea_json(p_uid, i) order by
      case when p_tab = 'open' and p_sort = 'new' then 0 else i.likes end desc,
      case when p_tab = 'open' and p_sort <> 'new' then i.created_at end asc,
      i.created_at desc), '[]')
    into res
    from public.ideas i
    where i.id in (select id from public.ideas
                   where case when p_tab = 'mine' then user_id = p_uid else status = p_tab end
                   order by case when p_tab = 'open' and p_sort = 'new' then 0 else likes end desc, created_at desc
                   limit 100);
  return jsonb_build_object('ideas', res,
    'staff', private.has_role(p_uid, array['admin', 'developer', 'moderator']::public.app_role[]),
    'today', (select count(*) from public.ideas where user_id = p_uid and created_at > now() - interval '24 hours'));
end $$;

-- a new idea starts with its author's like; 3 a day per player, no copy of an idea still in play
create or replace function private.idea_create(p_uid uuid, p_title text, p_body text) returns jsonb
language plpgsql as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); r public.ideas;
begin
  if char_length(t) < 6 or char_length(t) > 80 then perform private.fail('bad_title', 'O título precisa ter de 6 a 80 caracteres.'); end if;
  if char_length(b) > 1000 then perform private.fail('bad_body', 'A descrição pode ter até 1000 caracteres.'); end if;
  if (select count(*) from public.ideas where user_id = p_uid and created_at > now() - interval '24 hours') >= 3 then
    perform private.fail('idea_limit', 'Você já enviou 3 ideias nas últimas 24 horas. Tente de novo amanhã.');
  end if;
  if exists (select 1 from public.ideas where lower(title) = lower(t) and status in ('open', 'planned')) then
    perform private.fail('idea_duplicate', 'Já existe uma ideia com esse título: procure por ela e deixe o seu like.');
  end if;
  insert into public.ideas (user_id, title, body, likes) values (p_uid, t, b, 1) returning * into r;
  insert into public.idea_likes (idea_id, user_id) values (r.id, p_uid);
  return private.idea_json(p_uid, r);
end $$;

-- like / unlike; only while the idea is in the voting
create or replace function private.idea_like(p_uid uuid, p_id bigint, p_on boolean) returns jsonb
language plpgsql as $$
declare st text; n integer; total integer;
begin
  select status into st from public.ideas where id = p_id for update;
  if st is null then perform private.fail('idea_not_found', 'Ideia não encontrada.'); end if;
  if st <> 'open' then perform private.fail('idea_closed', 'A votação desta ideia já terminou.'); end if;
  if p_on then
    insert into public.idea_likes (idea_id, user_id) values (p_id, p_uid) on conflict do nothing;
    get diagnostics n = row_count;
    update public.ideas set likes = likes + n where id = p_id and n > 0;
  else
    delete from public.idea_likes where idea_id = p_id and user_id = p_uid;
    get diagnostics n = row_count;
    update public.ideas set likes = greatest(likes - n, 0) where id = p_id and n > 0;
  end if;
  select likes into total from public.ideas where id = p_id;
  return jsonb_build_object('id', p_id, 'likes', total, 'liked', p_on);
end $$;

-- the author removes their own idea while it is in the voting; staff remove any
create or replace function private.idea_delete(p_uid uuid, p_id bigint) returns jsonb
language plpgsql as $$
declare r public.ideas;
begin
  select * into r from public.ideas where id = p_id for update;
  if r.id is null then perform private.fail('idea_not_found', 'Ideia não encontrada.'); end if;
  if not ((r.user_id = p_uid and r.status = 'open') or private.has_role(p_uid, array['admin', 'developer', 'moderator']::public.app_role[])) then
    perform private.fail('forbidden', 'Você não pode apagar esta ideia.');
  end if;
  delete from public.ideas where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end $$;

-- staff: open → planned (next update) → done (in the game), or rejected, with an optional note
create or replace function private.idea_set_status(p_actor uuid, p_id bigint, p_status text, p_note text) returns jsonb
language plpgsql as $$
declare r public.ideas;
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  if p_status not in ('open', 'planned', 'done', 'rejected') then perform private.fail('bad_status', 'Status inválido.'); end if;
  update public.ideas set status = p_status, staff_note = coalesce(nullif(btrim(left(p_note, 300)), ''), staff_note)
    where id = p_id returning * into r;
  if r.id is null then perform private.fail('idea_not_found', 'Ideia não encontrada.'); end if;
  return private.idea_json(p_actor, r);
end $$;

/* ---------------- bug reports ---------------- */

-- 10 reports a day per player; p_shot is base64 (validated by the Edge Function, size checked here)
create or replace function private.bug_report(p_uid uuid, p_message text, p_context jsonb, p_mime text, p_shot text) returns jsonb
language plpgsql as $$
declare m text := btrim(coalesce(p_message, '')); img bytea; bid bigint;
begin
  if char_length(m) < 10 or char_length(m) > 2000 then perform private.fail('bad_message', 'Descreva o bug com 10 a 2000 caracteres.'); end if;
  if (select count(*) from public.bug_reports where user_id = p_uid and created_at > now() - interval '24 hours') >= 10 then
    perform private.fail('bug_limit', 'Você já enviou 10 relatos nas últimas 24 horas. Obrigado! Tente de novo amanhã.');
  end if;
  if p_shot is not null then
    img := decode(p_shot, 'base64');
    if octet_length(img) > 1048576 then perform private.fail('too_large', 'A imagem passou de 1 MB.'); end if;
  end if;
  insert into public.bug_reports (user_id, message, context, has_shot) values (p_uid, m, coalesce(p_context, '{}'::jsonb), img is not null)
    returning id into bid;
  if img is not null then insert into private.bug_screenshots (bug_id, mime, data) values (bid, p_mime, img); end if;
  return jsonb_build_object('id', bid);
end $$;

-- p_all: every report (staff only, optionally by status); otherwise the player's own
create or replace function private.bugs_list(p_uid uuid, p_all boolean, p_status text) returns jsonb
language plpgsql stable as $$
declare staff boolean := private.has_role(p_uid, array['admin', 'developer', 'moderator']::public.app_role[]);
begin
  if p_all and not staff then perform private.fail('forbidden', 'Sem permissão.'); end if;
  return jsonb_build_object('staff', staff, 'bugs', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'message', b.message, 'status', b.status,
      'staff_note', b.staff_note, 'has_shot', b.has_shot, 'created_at', b.created_at,
      'context', case when p_all then b.context else null end,
      'author', (select username from public.profiles where id = b.user_id)) order by b.created_at desc)
    from (select * from public.bug_reports
          where (p_all or user_id = p_uid) and (p_status is null or status = p_status)
          order by created_at desc limit 100) b), '[]'));
end $$;

create or replace function private.bug_shot(p_uid uuid, p_id bigint) returns jsonb
language plpgsql stable as $$
declare v_owner uuid; s private.bug_screenshots;
begin
  select user_id into v_owner from public.bug_reports where id = p_id;
  if v_owner is null then perform private.fail('bug_not_found', 'Relato não encontrado.'); end if;
  if v_owner <> p_uid and not private.has_role(p_uid, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  select * into s from private.bug_screenshots where bug_id = p_id;
  if s.bug_id is null then perform private.fail('bug_not_found', 'Este relato não tem imagem.'); end if;
  return jsonb_build_object('mime', s.mime, 'data', translate(encode(s.data, 'base64'), E'\n', ''));
end $$;

create or replace function private.bug_set_status(p_actor uuid, p_id bigint, p_status text, p_note text) returns jsonb
language plpgsql as $$
declare r public.bug_reports;
begin
  if not private.has_role(p_actor, array['admin', 'developer', 'moderator']::public.app_role[]) then perform private.fail('forbidden', 'Sem permissão.'); end if;
  if p_status not in ('new', 'confirmed', 'fixed', 'invalid') then perform private.fail('bad_status', 'Status inválido.'); end if;
  update public.bug_reports set status = p_status, staff_note = coalesce(nullif(btrim(left(p_note, 300)), ''), staff_note)
    where id = p_id returning * into r;
  if r.id is null then perform private.fail('bug_not_found', 'Relato não encontrado.'); end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'staff_note', r.staff_note);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.idea_json(uuid, public.ideas)', 'private.ideas_list(uuid, text, text)', 'private.idea_create(uuid, text, text)',
    'private.idea_like(uuid, bigint, boolean)', 'private.idea_delete(uuid, bigint)', 'private.idea_set_status(uuid, bigint, text, text)',
    'private.bug_report(uuid, text, jsonb, text, text)', 'private.bugs_list(uuid, boolean, text)', 'private.bug_shot(uuid, bigint)',
    'private.bug_set_status(uuid, bigint, text, text)'] loop
    execute 'revoke all on function ' || f || ' from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function ' || f || ' from anon, authenticated'; end if;
  end loop;
end $$;
