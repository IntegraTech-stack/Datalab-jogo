// DataLab · Edge Function "pass": the season pass (Passe Boot Inicial – Temporada 1, migration 20261101000100).
// POST { action: 'state' }
//    | { action: 'sync', season, xp, missions: [{ k, xp }], request_id }
// The game sends the pass XP it saw and the missions it finished since the last sync; the database caps
// them (private.pass_sync), raises the level and puts the rewards in the inventory. The answer carries
// the pass and the full inventory state.
import { serve, json, readJson, str, int, optUuid, HttpError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

const SEASON = /^[a-z0-9_]{1,20}$/;
const MISSION = /^[dw]:[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-z]{2,10}$/;

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 4096);
  await rateLimit(user.id, 'pass', 30, 60);
  const season = body.season === undefined ? 's1' : str(body.season, 'season', SEASON, 20);
  let rows;
  switch (body.action) {
    case 'state':
      rows = await sql`select private.pass_state(${user.id}::uuid, ${season}) as r`;
      break;
    case 'sync': {
      const xp = int(body.xp ?? 0, 'xp', 0, 1000000);
      const list = Array.isArray(body.missions) ? body.missions.slice(0, 12) : [];
      const missions = list.map((m) => {
        if (!m || typeof m !== 'object') throw new HttpError(400, 'bad_mission', 'Missão inválida.');
        const o = m as Record<string, unknown>;
        return { k: str(o.k, 'missions.k', MISSION, 32), xp: int(o.xp ?? 0, 'missions.xp', 0, 1000) };
      });
      // sql.json: serialised as jsonb exactly once (as in functions/game)
      rows = await sql`select private.pass_sync(${user.id}::uuid, ${season}, ${xp}, ${sql.json(missions as any)}, ${optUuid(body.request_id, 'request_id')}::uuid) as r`;
      break;
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
  return json(req, 200, rows[0].r);
});
