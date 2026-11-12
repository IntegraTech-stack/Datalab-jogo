// DataLab · Agent Gateway HTTP helpers: CORS allow-list, JSON in/out, errors that never leak internals.

export class HttpError extends Error {
  constructor(status, code, userMessage) {
    super(code);
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
  }
}

// "https://site.app,http://localhost:5500"; a "*" matches one DNS label (Vercel preview deploys)
export function originMatcher(origins) {
  const rules = origins.map((s) => s.replace(/\/+$/, '')).map((s) =>
    s.includes('*') ? new RegExp('^' + s.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+') + '$', 'i') : s);
  return (origin) => !!origin && rules.some((a) => (typeof a === 'string' ? a === origin : a.test(origin)));
}

export function corsHeaders(req, allowed) {
  const origin = req.headers.origin || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (allowed(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export function sendJson(res, req, allowed, status, body) {
  res.writeHead(status, { ...BASE_HEADERS, ...corsHeaders(req, allowed), 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function sendError(res, req, allowed, e) {
  if (e instanceof HttpError) return sendJson(res, req, allowed, e.status, { error: e.code, message: e.userMessage });
  console.error('[gateway] unexpected', e && e.stack ? e.stack : e);
  return sendJson(res, req, allowed, 500, { error: 'internal', message: 'Erro interno no servidor de agentes.' });
}

export async function readJson(req, maxBytes = 32_000) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'Requisição grande demais.');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) throw new HttpError(413, 'too_large', 'Requisição grande demais.');
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let body;
  try { body = JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'bad_json', 'JSON inválido.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_body', 'Corpo inválido.');
  return body;
}

// --- validators: no client value is trusted as-is ---
export const str = (v, name, re, max = 64) => {
  if (typeof v !== 'string' || v.length > max || !re.test(v)) throw new HttpError(400, 'bad_' + name, 'Campo inválido: ' + name + '.');
  return v;
};
export const ID = /^[A-Za-z0-9_-]{1,64}$/;
