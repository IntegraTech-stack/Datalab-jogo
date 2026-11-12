// DataLab · Agent Gateway configuration. Everything comes from the environment (see .env.example);
// nothing here is ever sent to the browser except the public "caps" (limits) and model names.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const int = (v, d, min, max) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const num = (v, d, min, max) => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig(over = {}) {
  const e = { ...process.env, ...over };
  const dataDir = path.resolve(e.AGENT_DATA_DIR || path.join(ROOT, 'data'));
  return {
    host: e.HOST || '127.0.0.1',
    port: int(e.PORT, 8787, 0, 65535),
    dataDir,
    // Supabase Auth: who is calling (the public anon key is enough to ask who owns a token)
    supabaseUrl: String(e.SUPABASE_URL || '').replace(/\/+$/, ''),
    supabaseAnonKey: e.SUPABASE_ANON_KEY || e.SUPABASE_PUBLISHABLE_KEY || '',
    // CORS: same rules as the Edge Functions (ALLOWED_ORIGINS, "*" matches one DNS label)
    allowedOrigins: list(e.ALLOWED_ORIGINS),
    // the OpenCode binary
    opencodeBin: e.OPENCODE_BIN || 'opencode',
    // true ONLY when the gateway itself runs inside the hardened container (Dockerfile): unlocks the
    // "scripts" command level (node / python / npm run), which is not safe on a bare host
    sandboxTrusted: bool(e.SANDBOX_TRUSTED, false),
    // models the players may pick ("provider/model", "*" wildcards). Default: OpenCode's catalog
    allowedModels: list(e.ALLOWED_MODELS || 'opencode/*'),
    defaultModel: e.DEFAULT_MODEL || 'opencode/big-pickle',
    // the web tools (webfetch / websearch) may be offered to players at all?
    allowWeb: bool(e.ALLOW_WEB, false),
    // server-wide ceilings: a player's own limits are always clamped to these
    caps: {
      dailyTasks: int(e.CAP_DAILY_TASKS, 30, 1, 1000),
      concurrent: int(e.CAP_CONCURRENT, 2, 1, 10),
      maxMinutes: int(e.CAP_MAX_MINUTES, 15, 1, 120),
      maxSteps: int(e.CAP_MAX_STEPS, 40, 1, 500),
      maxTokens: int(e.CAP_MAX_TOKENS, 1_000_000, 1_000, 50_000_000),
      dailyCostUsd: num(e.CAP_DAILY_COST_USD, 2, 0, 1000),
      promptChars: int(e.CAP_PROMPT_CHARS, 4000, 100, 50_000),
    },
    // the whole gateway: tasks running at the same time (each one is an OpenCode process)
    maxParallel: int(e.MAX_PARALLEL_TASKS, 4, 1, 64),
    approvalTimeoutSec: int(e.APPROVAL_TIMEOUT_SEC, 120, 1, 3600),
    // provider API keys handed to OpenCode (never to the browser). Only these names are read.
    providerKeys: Object.fromEntries(
      [['anthropic', 'ANTHROPIC_API_KEY'], ['openai', 'OPENAI_API_KEY'], ['openrouter', 'OPENROUTER_API_KEY'], ['google', 'GOOGLE_GENERATIVE_AI_API_KEY'], ['opencode', 'OPENCODE_API_KEY']]
        .filter(([, k]) => e[k]).map(([p, k]) => [p, e[k]]),
    ),
    // tests only: a fake agent with scripted events (never enable in production)
    mockAgent: bool(e.AGENT_MOCK, false),
  };
}
