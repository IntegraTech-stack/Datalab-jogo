// DataLab · Edge Function "economy": operations that move money outside a save.
// POST { action: 'exchange', credits, request_id }                       créditos → Gold
//      { action: 'expand_lot', slot, dw, dh, built, request_id }         buy land (company cash)
import { serve, json, readJson, int, optUuid, HttpError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 2048);
  await rateLimit(user.id, 'economy', 30, 60);
  switch (body.action) {
    case 'exchange': {
      const credits = int(body.credits, 'credits', 1, 1_000_000);
      const [r] = await sql`select private.wallet_exchange(${user.id}::uuid, ${credits}, ${optUuid(body.request_id, 'request_id')}::uuid) as r`;
      return json(req, 200, r.r);
    }
    case 'expand_lot': {
      const slot = int(body.slot, 'slot', 1, 3);
      const dw = int(body.dw, 'dw', 0, 4), dh = int(body.dh, 'dh', 0, 4);
      const built = body.built === undefined ? 0 : int(body.built, 'built', 0, 64 * 48);
      const [r] = await sql`select private.game_expand_lot(${user.id}::uuid, ${slot}, ${dw}, ${dh}, ${optUuid(body.request_id, 'request_id')}::uuid, ${built}) as r`;
      return json(req, 200, r.r);
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
});
