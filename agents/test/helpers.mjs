// Test helpers: a fake Supabase Auth (GET /auth/v1/user) and a gateway on a random port.
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGateway } from '../src/server.mjs';

export const USERS = {
  'token-alice-aaaaaaaaaaaaaaaaaaaa': { id: '11111111-1111-4111-8111-111111111111', email: 'alice@test' },
  'token-bob-bbbbbbbbbbbbbbbbbbbbbbbb': { id: '22222222-2222-4222-8222-222222222222', email: 'bob@test' },
};
export const ALICE = 'token-alice-aaaaaaaaaaaaaaaaaaaa';
export const BOB = 'token-bob-bbbbbbbbbbbbbbbbbbbbbbbb';
export const ORIGIN = 'http://localhost:5500';

export async function fakeSupabase() {
  const srv = http.createServer((req, res) => {
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (req.url === '/auth/v1/user' && req.headers.apikey === 'anon-key-public' && USERS[tok]) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(USERS[tok])); return; }
    res.writeHead(401); res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}

export async function startGateway(env = {}) {
  const sb = await fakeSupabase();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-agents-'));
  const g = await createGateway({ PORT: '0', AGENT_DATA_DIR: dataDir, SUPABASE_URL: sb.url, SUPABASE_ANON_KEY: 'anon-key-public', ALLOWED_ORIGINS: ORIGIN, ...env });
  const addr = await g.listen();
  const base = 'http://127.0.0.1:' + addr.port;
  const api = async (method, p, token, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* sse or empty */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  // follow the SSE stream until the task ends; returns every event
  const follow = async (id, token, onEvent, timeoutMs = 60_000) => {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch(base + '/v1/tasks/' + id + '/events', { headers: { authorization: 'Bearer ' + token }, signal: ac.signal });
    const evs = [];
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          if (chunk.startsWith('event: end')) { clearTimeout(to); ac.abort(); return evs; }
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          evs.push(ev);
          if (onEvent) await onEvent(ev);
        }
      }
    } catch (e) { if (!ac.signal.aborted) throw e; }
    clearTimeout(to);
    return evs;
  };
  return {
    base, api, follow, dataDir, g,
    async close() { const closed = new Promise((r) => g.server.close(r)); g.server.closeAllConnections(); await closed; await sb.close(); await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {}); },
  };
}
