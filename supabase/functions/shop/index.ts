// DataLab · Edge Function "shop": buy with Gold, claim event gifts, read the inventory state.
// POST { action: 'state' } | { action: 'purchase', item_id, request_id } | { action: 'claim', item_id }
import { serve, json, readJson, str, optUuid, ITEM_ID, HttpError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 4096);
  await rateLimit(user.id, 'shop', 40, 60);
  switch (body.action) {
    case 'state': {
      const [r] = await sql`select private.inventory_state(${user.id}::uuid) as r`;
      return json(req, 200, r.r);
    }
    case 'purchase': {
      const item = str(body.item_id, 'item_id', ITEM_ID);
      const request = optUuid(body.request_id, 'request_id');
      const [r] = await sql`select private.shop_purchase(${user.id}::uuid, ${item}, ${request}::uuid) as r`;
      return json(req, 200, r.r);
    }
    case 'claim': {
      const item = str(body.item_id, 'item_id', ITEM_ID);
      const [r] = await sql`select private.shop_claim_gift(${user.id}::uuid, ${item}) as r`;
      return json(req, 200, r.r);
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
});
