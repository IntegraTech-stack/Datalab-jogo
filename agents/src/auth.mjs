// DataLab · who is calling? Same rule as the Edge Functions (supabase/functions/_shared/auth.ts):
// the player's access token is checked with Supabase Auth (signature, expiry, revoked session) and the
// user id ALWAYS comes from there, never from the request. Answers are cached for a short while so a
// live progress stream does not hit Auth on every reconnect.
import { HttpError } from './http.mjs';

const TOKEN = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAuth(cfg, fetchImpl = fetch) {
  const cache = new Map(); // token -> { user, until }
  const TTL = 60_000;

  async function requireUser(req) {
    const m = TOKEN.exec(req.headers.authorization || '');
    if (!m) throw new HttpError(401, 'unauthorized', 'Faça login para continuar.');
    const token = m[1];
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return hit.user;
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new HttpError(503, 'auth_unconfigured', 'Servidor de agentes sem Supabase configurado.');
    let r;
    try {
      r = await fetchImpl(cfg.supabaseUrl + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + token, apikey: cfg.supabaseAnonKey } });
    } catch {
      throw new HttpError(503, 'auth_unavailable', 'Não foi possível validar a sessão agora.');
    }
    if (r.status === 401 || r.status === 403) throw new HttpError(401, 'unauthorized', 'Sessão expirada: faça login de novo.');
    if (!r.ok) throw new HttpError(503, 'auth_unavailable', 'Não foi possível validar a sessão agora.');
    const u = await r.json().catch(() => null);
    if (!u || typeof u.id !== 'string' || !UUID.test(u.id)) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    const user = { id: u.id.toLowerCase(), email: u.email || null };
    cache.set(token, { user, until: Date.now() + TTL });
    if (cache.size > 5000) for (const [k, v] of cache) if (v.until < Date.now()) cache.delete(k);
    return user;
  }

  return { requireUser };
}
