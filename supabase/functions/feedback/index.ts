// DataLab · Edge Function "feedback": community ideas (with likes) and bug reports (with a screenshot).
// POST { action: 'ideas', tab: open|planned|done|mine, sort: top|new }      any player
//      { action: 'idea_create', title, body }                               any player (3 a day)
//      { action: 'idea_like', id, on }                                      any player
//      { action: 'idea_delete', id }                                        author (still in the voting) | staff
//      { action: 'idea_status', id, status, note }                          admin | developer | moderator
//      { action: 'bug_report', message, context, image?: { mime, data } }   any player (10 a day, image ≤ 1 MB)
//      { action: 'bugs', scope: mine|all, status? }                         own | staff (all)
//      { action: 'bug_shot', id }                                           author | staff
//      { action: 'bug_status', id, status, note }                           admin | developer | moderator
// The role is checked here AND again inside every database function.
import { serve, json, readJson, str, optStr, int, obj, HttpError } from '../_shared/http.ts';
import { requireUser, requireRole } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';

const STAFF = ['admin', 'developer', 'moderator'];
const MAX_IMAGE = 1_048_576;
const MIMES: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP',
};

const id = (v: unknown) => int(v, 'id', 1, Number.MAX_SAFE_INTEGER);
// free text: no control characters except line breaks / tabs
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '');

// only what helps reproduce the bug, short strings, nothing the browser can blow up
function context(v: unknown, ua: string): Record<string, string> {
  const c = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Record<string, string> = { ua: ua.slice(0, 200) };
  for (const k of ['where', 'version', 'screen', 'preset', 'phase', 'mode', 'room']) {
    if (typeof c[k] === 'string' && c[k]) out[k] = text(c[k], 60);
  }
  return out;
}

function image(v: unknown): { mime: string; data: string } | null {
  if (v === undefined || v === null) return null;
  const o = obj(v, 'image');
  const mime = str(o.mime, 'mime', /^image\/(jpeg|png|webp)$/, 12);
  const data = str(o.data, 'image', /^[A-Za-z0-9+/]+={0,2}$/, Math.ceil(MAX_IMAGE / 3) * 4);
  const head = Uint8Array.from(atob(data.slice(0, 16)), (ch) => ch.charCodeAt(0));
  if (!MIMES[mime](head)) throw new HttpError(400, 'bad_image', 'A imagem não é um JPEG, PNG ou WebP válido.');
  return { mime, data };
}

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 1_500_000);
  await rateLimit(user.id, 'feedback', 60, 60);
  switch (body.action) {
    case 'ideas': {
      const tab = str(body.tab, 'tab', /^(open|planned|done|mine)$/, 8);
      const sort = optStr(body.sort, 'sort', /^(top|new)$/, 4) ?? 'top';
      const [r] = await sql`select private.ideas_list(${user.id}::uuid, ${tab}::text, ${sort}::text) as r`;
      return json(req, 200, r.r);
    }
    case 'idea_create': {
      await rateLimit(user.id, 'idea_create', 5, 600);
      const [r] = await sql`select private.idea_create(${user.id}::uuid, ${text(body.title, 120)}::text, ${text(body.body, 1200)}::text) as r`;
      return json(req, 200, r.r);
    }
    case 'idea_like': {
      const [r] = await sql`select private.idea_like(${user.id}::uuid, ${id(body.id)}::bigint, ${body.on === true}) as r`;
      return json(req, 200, r.r);
    }
    case 'idea_delete': {
      const [r] = await sql`select private.idea_delete(${user.id}::uuid, ${id(body.id)}::bigint) as r`;
      return json(req, 200, r.r);
    }
    case 'idea_status': {
      await requireRole(user, STAFF);
      const status = str(body.status, 'status', /^(open|planned|done|rejected)$/, 10);
      const [r] = await sql`select private.idea_set_status(${user.id}::uuid, ${id(body.id)}::bigint, ${status}::text, ${text(body.note, 300) || null}::text) as r`;
      return json(req, 200, r.r);
    }
    case 'bug_report': {
      await rateLimit(user.id, 'bug_report', 5, 600);
      const img = image(body.image);
      const ctx = context(body.context, req.headers.get('User-Agent') ?? '');
      const [r] = await sql`select private.bug_report(${user.id}::uuid, ${text(body.message, 2100)}::text, ${sql.json(ctx)}, ${img?.mime ?? null}::text, ${img?.data ?? null}::text) as r`;
      console.log('bug_report', JSON.stringify({ by: user.id, id: r.r.id, shot: !!img }));
      return json(req, 200, r.r);
    }
    case 'bugs': {
      const all = body.scope === 'all';
      if (all) await requireRole(user, STAFF);
      const status = optStr(body.status, 'status', /^(new|confirmed|fixed|invalid)$/, 10);
      const [r] = await sql`select private.bugs_list(${user.id}::uuid, ${all}, ${status}::text) as r`;
      return json(req, 200, r.r);
    }
    case 'bug_shot': {
      const [r] = await sql`select private.bug_shot(${user.id}::uuid, ${id(body.id)}::bigint) as r`;
      return json(req, 200, r.r);
    }
    case 'bug_status': {
      await requireRole(user, STAFF);
      const status = str(body.status, 'status', /^(new|confirmed|fixed|invalid)$/, 10);
      const [r] = await sql`select private.bug_set_status(${user.id}::uuid, ${id(body.id)}::bigint, ${status}::text, ${text(body.note, 300) || null}::text) as r`;
      return json(req, 200, r.r);
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
});
