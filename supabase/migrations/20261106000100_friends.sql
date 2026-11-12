-- DataLab · friends: a player asks another by username, the other accepts or declines.
-- One row per pair of players, whoever asked (user_a < user_b, so A→B and B→A can't both exist). A pending row
-- becomes 'accepted'; declining, cancelling and removing a friend delete it, and the two can start over.
-- Each player sees only their own requests and friends, and of the others only username and display name.
-- Nothing here is readable or writable from the browser: everything goes through the "friends" Edge
-- Function, which calls the private.* functions below with the user id taken from the JWT.

create table if not exists public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  constraint friendships_order check (user_a < user_b),
  constraint friendships_requester check (requested_by in (user_a, user_b))
);
create index if not exists friendships_user_b on public.friendships (user_b);

-- RLS on, no grants: the browser never touches this table directly
alter table public.friendships enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.friendships from anon, authenticated;
  end if;
end $$;

-- everything the player's Amigos tab shows: every change answers with this, so the screen is always current
create or replace function private.friends_list(p_uid uuid) returns jsonb
language sql stable as $$
  with mine as (
    select case when f.user_a = p_uid then f.user_b else f.user_a end as other, f.status, f.requested_by, f.created_at, f.accepted_at
    from public.friendships f
    where f.user_a = p_uid or f.user_b = p_uid
  ), rows as (
    select m.*, jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'at', coalesce(m.accepted_at, m.created_at)) as j, lower(p.username) as sort_name
    from mine m join public.profiles p on p.id = m.other
  )
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(j order by sort_name) from rows where status = 'accepted'), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(j order by created_at desc) from rows where status = 'pending' and requested_by <> p_uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(j order by created_at desc) from rows where status = 'pending' and requested_by = p_uid), '[]'::jsonb));
$$;

-- the limits: friends on the list, requests waiting for an answer (asked, and received: nobody can flood someone)
create or replace function private.friend_count(p_uid uuid, p_status text, p_asked boolean default null) returns integer
language sql stable as $$
  select count(*)::integer from public.friendships f
  where (f.user_a = p_uid or f.user_b = p_uid) and f.status = p_status
    and (p_asked is null or (f.requested_by = p_uid) = p_asked);
$$;

-- makes a pending row a friendship (both lists must have room)
create or replace function private.friend_accept_row(p_uid uuid, p_other uuid) returns void
language plpgsql as $$
begin
  if private.friend_count(p_uid, 'accepted') >= 200 then perform private.fail('friend_limit', 'Sua lista de amigos está cheia (200).'); end if;
  if private.friend_count(p_other, 'accepted') >= 200 then perform private.fail('friend_limit', 'A lista de amigos dessa pessoa está cheia.'); end if;
  update public.friendships set status = 'accepted', accepted_at = now()
  where user_a = least(p_uid, p_other) and user_b = greatest(p_uid, p_other);
end $$;

-- a request by username. If the other player had already asked me, that's a yes: we are friends right away.
create or replace function private.friend_request(p_uid uuid, p_username text) returns jsonb
language plpgsql as $$
declare
  v_other public.profiles;
  v_row public.friendships;
begin
  select * into v_other from public.profiles where lower(username) = lower(trim(p_username));
  if not found then perform private.fail('user_not_found', 'Não encontramos ninguém com esse nome de usuário.'); end if;
  if v_other.id = p_uid then perform private.fail('friend_self', 'Esse é o seu próprio usuário.'); end if;

  -- a new row, unless the pair already has one (the unique key also settles two requests at the same moment)
  if private.friend_count(p_uid, 'pending', true) >= 50 then
    if not exists (select 1 from public.friendships where user_a = least(p_uid, v_other.id) and user_b = greatest(p_uid, v_other.id)) then
      perform private.fail('friend_limit', 'Você tem muitos pedidos sem resposta: cancele alguns antes.');
    end if;
  end if;
  if private.friend_count(v_other.id, 'pending', false) < 100 then
    insert into public.friendships (user_a, user_b, requested_by)
    values (least(p_uid, v_other.id), greatest(p_uid, v_other.id), p_uid)
    on conflict (user_a, user_b) do nothing;
    if found then return jsonb_build_object('status', 'pending', 'username', v_other.username, 'lists', private.friends_list(p_uid)); end if;
  end if;

  select * into v_row from public.friendships
  where user_a = least(p_uid, v_other.id) and user_b = greatest(p_uid, v_other.id) for update;
  if not found then perform private.fail('friend_limit', 'Essa pessoa tem muitos pedidos sem resposta. Tente mais tarde.'); end if;
  if v_row.status = 'accepted' then perform private.fail('friend_exists', 'Vocês já são amigos.'); end if;
  if v_row.requested_by = p_uid then perform private.fail('friend_pending', 'Você já enviou um pedido para essa pessoa.'); end if;
  perform private.friend_accept_row(p_uid, v_other.id);
  return jsonb_build_object('status', 'accepted', 'username', v_other.username, 'lists', private.friends_list(p_uid));
end $$;

-- the answer to a request received: only the one who was asked can answer
create or replace function private.friend_respond(p_uid uuid, p_other uuid, p_accept boolean) returns jsonb
language plpgsql as $$
declare v_row public.friendships;
begin
  select * into v_row from public.friendships
  where user_a = least(p_uid, p_other) and user_b = greatest(p_uid, p_other) and status = 'pending' and requested_by = p_other for update;
  if not found then perform private.fail('friend_not_found', 'Esse pedido não existe mais.'); end if;
  if p_accept then perform private.friend_accept_row(p_uid, p_other);
  else delete from public.friendships where user_a = v_row.user_a and user_b = v_row.user_b; end if;
  return jsonb_build_object('lists', private.friends_list(p_uid));
end $$;

-- leaves a friendship, or cancels a request I sent (a request I received is answered with friend_respond)
create or replace function private.friend_remove(p_uid uuid, p_other uuid) returns jsonb
language plpgsql as $$
begin
  delete from public.friendships
  where user_a = least(p_uid, p_other) and user_b = greatest(p_uid, p_other)
    and (status = 'accepted' or requested_by = p_uid);
  if not found then perform private.fail('friend_not_found', 'Essa pessoa não está mais na sua lista.'); end if;
  return jsonb_build_object('lists', private.friends_list(p_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.friends_list(uuid)', 'private.friend_count(uuid, text, boolean)', 'private.friend_accept_row(uuid, uuid)',
    'private.friend_request(uuid, text)', 'private.friend_respond(uuid, uuid, boolean)', 'private.friend_remove(uuid, uuid)'] loop
    execute 'revoke all on function ' || f || ' from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function ' || f || ' from anon, authenticated'; end if;
  end loop;
end $$;
