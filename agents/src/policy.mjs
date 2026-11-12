// DataLab · what an agent may do. Two layers:
//   1. limits  — the player's own settings, always clamped to the server's caps (config.mjs)
//   2. rules   — OpenCode permission rules for every session (the LAST matching rule wins):
//                everything denied, then file tools inside the workspace, a shell allow-list,
//                and nothing outside the workspace (external_directory) ever.
// Anything the rules leave as "ask" is shown to the player in the game, who approves or refuses it
// (or it is refused automatically, depending on the settings).
import { HttpError } from './http.mjs';

export const SHELL_LEVELS = ['none', 'files', 'scripts'];

export const DEFAULT_LIMITS = {
  dailyTasks: 20,
  concurrent: 1,
  maxMinutes: 10,
  maxSteps: 25,
  maxTokens: 400_000,
  dailyCostUsd: 0.5,
  shell: 'files',
  web: false,
  approvals: 'ask', // ask | reject
};

// The player's settings → the effective limits (unknown fields dropped, numbers clamped, levels
// the server does not allow lowered).
export function clampLimits(input, cfg) {
  const src = input && typeof input === 'object' ? input : {};
  const caps = cfg.caps;
  const n = (v, d, max, min = 1) => {
    const x = typeof v === 'number' && Number.isFinite(v) ? v : d;
    return Math.min(max, Math.max(min, x));
  };
  const shellOk = (s) => SHELL_LEVELS.includes(s) && (s !== 'scripts' || cfg.sandboxTrusted);
  return {
    dailyTasks: Math.round(n(src.dailyTasks, DEFAULT_LIMITS.dailyTasks, caps.dailyTasks)),
    concurrent: Math.round(n(src.concurrent, DEFAULT_LIMITS.concurrent, caps.concurrent)),
    maxMinutes: Math.round(n(src.maxMinutes, DEFAULT_LIMITS.maxMinutes, caps.maxMinutes)),
    maxSteps: Math.round(n(src.maxSteps, DEFAULT_LIMITS.maxSteps, caps.maxSteps)),
    maxTokens: Math.round(n(src.maxTokens, DEFAULT_LIMITS.maxTokens, caps.maxTokens, 1000)),
    dailyCostUsd: Math.round(n(src.dailyCostUsd, DEFAULT_LIMITS.dailyCostUsd, caps.dailyCostUsd, 0) * 100) / 100,
    shell: shellOk(src.shell) ? src.shell : 'files',
    web: !!src.web && cfg.allowWeb,
    approvals: src.approvals === 'reject' ? 'reject' : 'ask',
  };
}

// What the settings screen offers (and why some options are locked).
export function capsInfo(cfg) {
  return { ...cfg.caps, shellLevels: SHELL_LEVELS.filter((s) => s !== 'scripts' || cfg.sandboxTrusted), web: cfg.allowWeb, sandboxTrusted: cfg.sandboxTrusted };
}

/* ------------------------------------------------------------------ */
/* Shell allow-list                                                     */
/* ------------------------------------------------------------------ */
// never, at any level: network, privilege, process control, secrets in the environment, other shells
const BASH_DENY = [
  'curl*', 'wget*', 'ssh*', 'scp*', 'sftp*', 'rsync*', 'nc *', 'ncat*', 'netcat*', 'telnet*', 'ftp*', 'socat*',
  'sudo*', 'su', 'su *', 'doas*', 'chmod*', 'chown*', 'chgrp*', 'mount*', 'umount*', 'crontab*', 'at *',
  'docker*', 'podman*', 'kubectl*', 'systemctl*', 'service *', 'kill*', 'pkill*', 'killall*', 'shutdown*', 'reboot*', 'halt*',
  'env', 'env *', 'printenv*', 'set', 'export*', 'declare*', 'history*', 'source *', '. *', 'exec *', 'eval *',
  'bash*', 'sh *', 'sh', 'zsh*', 'fish*', 'dash*', 'powershell*', 'pwsh*', 'cmd*', 'cmd.exe*', 'wsl*', 'start *',
  'npm install*', 'npm i *', 'npm i', 'npm add*', 'npm ci*', 'npx*', 'pnpm*', 'yarn*', 'bun*', 'pip*', 'pip3*', 'uv *', 'apt*', 'yum*', 'apk*', 'brew*', 'choco*', 'winget*',
  'git push*', 'git pull*', 'git fetch*', 'git clone*', 'git remote*', 'git config*', 'git submodule*',
  'find * -exec*', 'find * -delete*', 'find * -execdir*', 'xargs*', 'dd *', 'mkfs*', 'ln *',
];
// plain file work inside the workspace
const BASH_FILES = [
  'ls', 'ls *', 'pwd', 'cat *', 'head *', 'tail *', 'wc *', 'grep *', 'find *', 'tree*', 'sort *', 'uniq *', 'diff *', 'cut *',
  'mkdir *', 'touch *', 'cp *', 'mv *', 'echo *', 'printf *', 'date', 'true', 'test *', 'basename *', 'dirname *', 'file *', 'stat *', 'du *',
  'git status*', 'git diff*', 'git log*', 'git init*', 'git add *', 'git commit *', 'git show*', 'git branch*', 'git checkout *', 'git switch *', 'git restore *', 'git mv *', 'git rm *',
];
// running the code it wrote: only when the gateway lives in the hardened container
const BASH_SCRIPTS = ['node *', 'python *', 'python3 *', 'npm test*', 'npm run *', 'deno run *', 'deno test*', 'tsc*', 'make*', 'go run *', 'go test*', 'cargo run*', 'cargo test*', 'cargo build*'];

const rule = (permission, pattern, action) => ({ permission, pattern, action });

export function permissionRules(limits) {
  const unknown = limits.approvals === 'reject' ? 'deny' : 'ask';
  const r = [
    rule('*', '*', 'deny'),
    // file tools: allowed — "external_directory" (last) keeps them inside the workspace
    rule('read', '*', 'allow'), rule('list', '*', 'allow'), rule('glob', '*', 'allow'), rule('grep', '*', 'allow'),
    rule('edit', '*', 'allow'), rule('todowrite', '*', 'allow'), rule('todoread', '*', 'allow'),
    // OpenCode's own config / plugins in the workspace could change the rules on the next run
    rule('edit', '*opencode.json*', 'deny'), rule('edit', '*.opencode*', 'deny'),
  ];
  if (limits.shell !== 'none') {
    r.push(rule('bash', '*', unknown));
    for (const p of BASH_FILES) r.push(rule('bash', p, 'allow'));
    if (limits.shell === 'scripts') for (const p of BASH_SCRIPTS) r.push(rule('bash', p, 'allow'));
    for (const p of BASH_DENY) r.push(rule('bash', p, 'deny'));
  }
  if (limits.web) { r.push(rule('webfetch', '*', 'allow')); r.push(rule('websearch', '*', 'allow')); }
  // sub-agents, questions to a human that is not watching, skills from elsewhere: no
  r.push(rule('task', '*', 'deny'), rule('question', '*', 'deny'), rule('skill', '*', 'deny'), rule('doom_loop', '*', 'deny'));
  // nothing outside the workspace, ever (read, write, or paths inside shell commands)
  r.push(rule('external_directory', '*', 'deny'));
  return r;
}

/* ------------------------------------------------------------------ */
/* Secrets never leave the gateway                                      */
/* ------------------------------------------------------------------ */
export function createRedactor(secrets) {
  const vals = [...new Set(secrets.filter((s) => typeof s === 'string' && s.length >= 8))].sort((a, b) => b.length - a.length);
  return function redact(v) {
    if (typeof v === 'string') {
      let s = v;
      for (const x of vals) if (s.includes(x)) s = s.split(x).join('[segredo removido]');
      return s;
    }
    if (Array.isArray(v)) return v.map(redact);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = redact(x);
      return o;
    }
    return v;
  };
}

// "provider/model" with "*" wildcards
export function modelAllowed(model, cfg) {
  if (typeof model !== 'string' || !/^[a-z0-9._-]{1,40}\/[A-Za-z0-9._:/-]{1,80}$/.test(model)) return false;
  return cfg.allowedModels.some((p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(model));
}

export function checkPrompt(prompt, cfg) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new HttpError(400, 'bad_prompt', 'Descreva a tarefa.');
  if (prompt.length > cfg.caps.promptChars) throw new HttpError(413, 'prompt_too_long', 'Tarefa longa demais (máx. ' + cfg.caps.promptChars + ' caracteres).');
  return prompt.trim();
}
