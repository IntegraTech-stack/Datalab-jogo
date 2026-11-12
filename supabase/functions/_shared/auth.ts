// DataLab · who is calling? Every Edge Function validates the user's access token with Supabase Auth
// (signature, expiry, revoked session) before touching the database. The user id used by the
// database functions ALWAYS comes from here, never from the request body.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HttpError } from './http.ts';
import { hasRole, sql } from './db.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// the public (anon / publishable) key is enough to ask Auth who owns a token
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

const auth = createClient(SUPABASE_URL, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

export interface Caller {
  id: string;
  email: string | null;
}

export async function requireUser(req: Request): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(header);
  if (!m) throw new HttpError(401, 'unauthorized', 'Faça login para continuar.');
  const { data, error } = await auth.auth.getUser(m[1]);
  if (error || !data?.user) throw new HttpError(401, 'unauthorized', 'Sessão expirada: faça login de novo.');
  await requireLatestSession(data.user.id, m[1]);
  return { id: data.user.id, email: data.user.email ?? null };
}

// One computer per account: only the account's most recent login may act. An older one (another machine
// still open) is refused, and the game there signs out locally.
async function requireLatestSession(uid: string, token: string) {
  const sid = sessionIdOf(token);
  if (!sid) return;
  const [newest] = await sql`select id::text as id from auth.sessions where user_id = ${uid}::uuid order by created_at desc limit 1`;
  if (newest && newest.id !== sid) throw new HttpError(409, 'session_replaced', 'Sua conta entrou em outro computador. Este aqui foi desconectado.');
}

// the token was already verified by Auth (getUser): reading its payload is enough
function sessionIdOf(token: string): string | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}

export async function requireRole(user: Caller, roles: string[]) {
  if (!(await hasRole(user.id, roles))) throw new HttpError(403, 'forbidden', 'Você não tem permissão para isso.');
}
