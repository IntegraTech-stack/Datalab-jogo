// DataLab · Edge Function "friends": the player's friends and friend requests.
// POST { action: 'list' }                       → { friends, incoming, outgoing }
//      { action: 'request', username }          → { status: pending|accepted, username, lists }  (20 per 10 min)
//      { action: 'respond', id, accept }        → { lists }   a request received: accept or decline
//      { action: 'remove', id }                 → { lists }   a friend, or a request I sent
// Each list holds { id, username, display_name, at }. "lists" has the same shape as the answer to 'list'.
// Errors: 400 bad_* | friend_self · 401 unauthorized · 404 user_not_found | friend_not_found ·
//         409 friend_exists | friend_pending · 429 friend_limit | rate_limited · 500 internal
// The player's id comes from the JWT, never from the body: "id" is always the other player.
import { serve, json, readJson, str, uuid } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 2048);
  await rateLimit(user.id, 'friends', 60, 60);
  switch (body.action) {
    case 'list': {
      const [r] = await sql`select private.friends_list(${user.id}::uuid) as r`;
      return json(req, 200, r.r);
    }
    case 'request': {
      const username = str(body.username, 'username', USERNAME, 20);
      await rateLimit(user.id, 'friend_request', 20, 600);
      const [r] = await sql`select private.friend_request(${user.id}::uuid, ${username}::text) as r`;
      return json(req, 200, r.r);
    }
    case 'respond': {
      const [r] = await sql`select private.friend_respond(${user.id}::uuid, ${uuid(body.id, 'id')}::uuid, ${body.accept === true}) as r`;
      return json(req, 200, r.r);
    }
    case 'remove': {
      const [r] = await sql`select private.friend_remove(${user.id}::uuid, ${uuid(body.id, 'id')}::uuid) as r`;
      return json(req, 200, r.r);
    }
    default:
      return json(req, 400, { error: 'bad_action', message: 'Ação inválida.' });
  }
});
