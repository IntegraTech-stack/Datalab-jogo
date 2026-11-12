// DataLab · shared HTTP helpers for the Edge Functions: CORS allow-list, JSON in/out, errors.
// Nothing here ever returns a secret, a stack trace or a raw database error to the browser.

export class HttpError extends Error {
  constructor(public status: number, public code: string, public userMessage: string) {
    super(code);
  }
}

// ALLOWED_ORIGINS="https://datalab.example.com,http://localhost:5500" (secret / env var)
// A "*" matches one DNS label part, for Vercel preview deploys:
//   https://datalab-*-castrof14s-projects.vercel.app
// (never a bare "https://*.vercel.app": anyone can deploy there)
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)
  .map((s) => (s.includes('*') ? new RegExp('^' + s.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+') + '$', 'i') : s));
const isAllowed = (origin: string) => allowed.some((a) => (typeof a === 'string' ? a === origin : a.test(origin)));

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && isAllowed(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Body as JSON with a hard size limit (bytes).
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'Requisição grande demais.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Requisição grande demais.');
  let body: unknown;
  try {
    body = JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON inválido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_body', 'Corpo inválido.');
  return body as Record<string, unknown>;
}

// --- tiny validators (no client value is trusted as-is) ---
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const str = (v: unknown, name: string, re: RegExp, max = 64): string => {
  if (typeof v !== 'string' || v.length > max || !re.test(v)) throw new HttpError(400, 'bad_' + name, 'Campo inválido: ' + name + '.');
  return v;
};
export const optStr = (v: unknown, name: string, re: RegExp, max = 64): string | null => (v === undefined || v === null || v === '' ? null : str(v, name, re, max));
export const int = (v: unknown, name: string, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, 'bad_' + name, 'Campo inválido: ' + name + '.');
  return v;
};
export const uuid = (v: unknown, name: string): string => str(v, name, UUID, 36);
export const optUuid = (v: unknown, name: string): string | null => (v === undefined || v === null || v === '' ? null : uuid(v, name));
export const ITEM_ID = /^[a-z0-9_]{2,40}$/;
export const obj = (v: unknown, name: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'bad_' + name, 'Campo inválido: ' + name + '.');
  return v as Record<string, unknown>;
};

// Map database errors raised by private.fail (SQLSTATE P0001, message = code, hint = text) to HTTP.
const STATUS: Record<string, number> = {
  forbidden: 403, rate_limited: 429, duplicate_request: 409, not_owned: 404, item_not_found: 404, user_not_found: 404,
  save_not_found: 404, pack_not_found: 404, idea_not_found: 404, bug_not_found: 404, idea_limit: 429, bug_limit: 429, idea_duplicate: 409, idea_closed: 409, too_large: 413, order_not_found: 404, already_owned: 409, already_claimed: 409, insufficient_gold: 402, insufficient_credits: 402, insufficient_cash: 402,
  friend_not_found: 404, friend_exists: 409, friend_pending: 409, friend_limit: 429,
};
export function toResponse(req: Request, e: unknown): Response {
  if (e instanceof HttpError) return json(req, e.status, { error: e.code, message: e.userMessage });
  const pg = e as { code?: string; message?: string; hint?: string };
  if (pg && pg.code === 'P0001' && typeof pg.message === 'string') {
    return json(req, STATUS[pg.message] ?? 400, { error: pg.message, message: pg.hint ?? 'Operação recusada.' });
  }
  console.error('unexpected error', pg && pg.code, pg && pg.message);
  return json(req, 500, { error: 'internal', message: 'Erro interno. Tente de novo em instantes.' });
}

// Standard handler: CORS preflight, POST only, errors mapped.
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed', message: 'Use POST.' });
    try {
      return await handler(req);
    } catch (e) {
      return toResponse(req, e);
    }
  });
}
