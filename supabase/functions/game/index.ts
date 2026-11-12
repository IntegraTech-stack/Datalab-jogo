// DataLab · Edge Function "game": cloud saves. The server prices what changed, caps revenue and
// credits, checks legendary bots and skins, prices the career problems solved (XP) and gates
// promotions, and returns the authoritative balances and career.
// POST { action: 'new', slot, name, preset } | { action: 'load', slot } | { action: 'delete', slot }
//      { action: 'save', slot, data, claim, request_id }
import { serve, json, readJson, int, str, obj, optUuid, HttpError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

const MAX_SAVE = 2_500_000; // bytes
const PRESET = /^[a-z]{2,16}$/;

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, MAX_SAVE);
  const action = body.action;
  await rateLimit(user.id, action === 'save' ? 'game_save' : 'game', action === 'save' ? 20 : 30, 60);
  switch (action) {
    case 'new': {
      const slot = int(body.slot, 'slot', 1, 3);
      const name = typeof body.name === 'string' ? body.name.slice(0, 40) : 'Meu datacenter';
      const [r] = await sql`select private.game_new(${user.id}::uuid, ${slot}, ${name}, ${str(body.preset, 'preset', PRESET, 16)}) as r`;
      return json(req, 200, r.r);
    }
    case 'load': {
      const [r] = await sql`select private.game_load(${user.id}::uuid, ${int(body.slot, 'slot', 1, 3)}) as r`;
      if (!r.r) throw new HttpError(404, 'save_not_found', 'Nenhum jogo salvo neste espaço.');
      return json(req, 200, r.r);
    }
    case 'save': {
      const slot = int(body.slot, 'slot', 1, 3);
      const data = obj(body.data, 'data');
      const claim = body.claim === undefined ? {} : obj(body.claim, 'claim');
      // sql.json: postgres.js serialises it as jsonb exactly once (a pre-stringified value would arrive double-encoded)
      // deno-lint-ignore no-explicit-any
      const [r] = await sql`select private.game_save_career(${user.id}::uuid, ${slot}, ${sql.json(data as any)}, ${sql.json(claim as any)}, ${optUuid(body.request_id, 'request_id')}::uuid) as r`;
      return json(req, 200, r.r);
    }
    case 'delete': {
      const [r] = await sql`select private.game_delete(${user.id}::uuid, ${int(body.slot, 'slot', 1, 3)}) as r`;
      return json(req, 200, r.r);
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
});
