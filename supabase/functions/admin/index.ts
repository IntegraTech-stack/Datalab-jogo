// DataLab · Edge Function "admin": staff only (roles in public.user_roles, set in the database).
// POST { action: 'whoami' }                                              any logged-in user: own roles
//      { action: 'find_users', query }                                   admin | developer | moderator
//      { action: 'grant', user_id, item_id | currency, quantity, grant_type, reason, request_id }   admin | developer
//      { action: 'log', limit }                                          admin | developer | moderator
//      { action: 'set_role', user_id, role, enabled }                    admin
//      { action: 'set_title', user_id, title, enabled }                  admin | developer
// The role is checked here AND again inside every database function.
import { serve, json, readJson, str, optStr, int, uuid, optUuid, ITEM_ID, HttpError } from '../_shared/http.ts';
import { requireUser, requireRole } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

const GRANT_TYPE = /^(developer|founder|beta|event|compensation|special)$/;
const ROLE = /^(admin|developer|moderator)$/;
const TITLE = /^(founder|beta|creator|supporter|vip)$/;

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 4096);
  await rateLimit(user.id, 'admin', 30, 60);
  switch (body.action) {
    case 'whoami': {
      const rows = await sql`select role from public.user_roles where user_id = ${user.id}::uuid`;
      return json(req, 200, { id: user.id, roles: rows.map((r) => r.role) });
    }
    case 'find_users': {
      await requireRole(user, ['admin', 'developer', 'moderator']);
      const q = typeof body.query === 'string' ? body.query.slice(0, 40) : '';
      const [r] = await sql`select private.admin_find_users(${user.id}::uuid, ${q}) as r`;
      return json(req, 200, r.r);
    }
    case 'grant': {
      await requireRole(user, ['admin', 'developer']);
      const target = uuid(body.user_id, 'user_id');
      const item = optStr(body.item_id, 'item_id', ITEM_ID);
      const currency = optStr(body.currency, 'currency', /^(gold|credits)$/);
      if (!item === !currency) throw new HttpError(400, 'bad_target', 'Escolha um item OU uma moeda.');
      const qty = int(body.quantity, 'quantity', 1, currency ? 1_000_000 : 100);
      const type = str(body.grant_type, 'grant_type', GRANT_TYPE, 16);
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      if (reason.length < 3) throw new HttpError(400, 'reason_required', 'Informe o motivo.');
      const [r] = await sql`select private.admin_grant(${user.id}::uuid, ${target}::uuid, ${item}, ${currency}, ${qty}, ${type}::public.grant_type, ${reason}, ${optUuid(body.request_id, 'request_id')}::uuid) as r`;
      console.log('grant', JSON.stringify({ by: user.id, to: target, item, currency, qty, type }));
      return json(req, 200, r.r);
    }
    case 'log': {
      await requireRole(user, ['admin', 'developer', 'moderator']);
      const limit = body.limit === undefined ? 50 : int(body.limit, 'limit', 1, 200);
      const [r] = await sql`select private.admin_grants_log(${user.id}::uuid, ${limit}) as r`;
      return json(req, 200, r.r);
    }
    case 'set_role': {
      await requireRole(user, ['admin']);
      const enabled = body.enabled === true;
      const [r] = await sql`select private.admin_set_role(${user.id}::uuid, ${uuid(body.user_id, 'user_id')}::uuid, ${str(body.role, 'role', ROLE, 16)}::public.app_role, ${enabled}) as r`;
      return json(req, 200, { roles: r.r });
    }
    case 'set_title': {
      await requireRole(user, ['admin', 'developer']);
      const enabled = body.enabled === true;
      const [r] = await sql`select private.admin_set_title(${user.id}::uuid, ${uuid(body.user_id, 'user_id')}::uuid, ${str(body.title, 'title', TITLE, 16)}, ${enabled}) as r`;
      return json(req, 200, { titles: r.r });
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
});
