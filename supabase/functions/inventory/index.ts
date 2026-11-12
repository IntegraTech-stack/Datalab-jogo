// DataLab · Edge Function "inventory": equip, unequip, sell, consume.
// POST { action: 'state' } | { action: 'equip', item_id } | { action: 'unequip', slot }
//      | { action: 'sell', item_id, request_id } | { action: 'consume', item_id, request_id }
import { serve, json, readJson, str, optUuid, ITEM_ID, HttpError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

// the hacker collection adds the accessory positions and the pet (migration 20261030000200), the
// Equipamentos tab the terminal skin (migration 20261031000100), the trails and the season pass' profile
// frame and title (migration 20261101000100), the pass' profile icon and aura (migration 20261101000200)
const SLOT = /^(rack|server|switch|storage|rackacc|led|shirt|pants|hair|hat|shades|scarf|backpack|chain|head|face|neck|back|hands|pet|terminal|trail|aura|frame|icon|title)$/;

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 4096);
  await rateLimit(user.id, 'inventory', 60, 60);
  let rows;
  switch (body.action) {
    case 'state':
      rows = await sql`select private.inventory_state(${user.id}::uuid) as r`;
      break;
    case 'equip':
      rows = await sql`select private.inventory_equip(${user.id}::uuid, ${str(body.item_id, 'item_id', ITEM_ID)}) as r`;
      break;
    case 'unequip':
      rows = await sql`select private.inventory_unequip(${user.id}::uuid, ${str(body.slot, 'slot', SLOT, 16)}) as r`;
      break;
    case 'sell':
      rows = await sql`select private.inventory_sell(${user.id}::uuid, ${str(body.item_id, 'item_id', ITEM_ID)}, ${optUuid(body.request_id, 'request_id')}::uuid) as r`;
      break;
    case 'consume':
      rows = await sql`select private.inventory_consume(${user.id}::uuid, ${str(body.item_id, 'item_id', ITEM_ID)}, ${optUuid(body.request_id, 'request_id')}::uuid) as r`;
      break;
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
  return json(req, 200, rows[0].r);
});
