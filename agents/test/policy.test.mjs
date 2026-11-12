// policy.mjs: limits are clamped to the server caps; the OpenCode rules do what we expect when the
// LAST matching rule wins (the semantics verified against a real OpenCode server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { clampLimits, permissionRules, createRedactor, modelAllowed, checkPrompt } from '../src/policy.mjs';

const cfg = loadConfig({ CAP_DAILY_TASKS: '10', CAP_MAX_MINUTES: '5', CAP_CONCURRENT: '2', SANDBOX_TRUSTED: '0', ALLOW_WEB: '0', ALLOWED_MODELS: 'opencode/*,anthropic/claude-sonnet-*' });

// OpenCode's wildcard: "*" any run of characters, "?" one; whole-string match
const wild = (p, s) => new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 's').test(s);
const decide = (rules, permission, value) => {
  let a = 'ask';
  for (const r of rules) if (wild(r.permission, permission) && wild(r.pattern, value)) a = r.action;
  return a;
};

test('limits are clamped to the caps and unknown values fall back', () => {
  const l = clampLimits({ dailyTasks: 999, maxMinutes: 0, concurrent: 'x', shell: 'scripts', web: true, approvals: 'nope', extra: 1 }, cfg);
  assert.equal(l.dailyTasks, 10);
  assert.equal(l.maxMinutes, 1);
  assert.equal(l.concurrent, 1);
  assert.equal(l.shell, 'files', 'scripts needs the hardened container');
  assert.equal(l.web, false, 'web needs ALLOW_WEB');
  assert.equal(l.approvals, 'ask');
  assert.equal('extra' in l, false);
  const trusted = loadConfig({ SANDBOX_TRUSTED: '1', ALLOW_WEB: '1' });
  assert.equal(clampLimits({ shell: 'scripts', web: true }, trusted).shell, 'scripts');
  assert.equal(clampLimits({ shell: 'scripts', web: true }, trusted).web, true);
});

test('rules: files level', () => {
  const r = permissionRules(clampLimits({}, cfg));
  assert.equal(decide(r, 'read', 'notes.md'), 'allow');
  assert.equal(decide(r, 'edit', 'src/app.js'), 'allow');
  assert.equal(decide(r, 'edit', 'opencode.json'), 'deny');
  assert.equal(decide(r, 'edit', '.opencode/plugin/x.js'), 'deny');
  assert.equal(decide(r, 'external_directory', 'C:/Users/x/*'), 'deny');
  assert.equal(decide(r, 'bash', 'ls -la'), 'allow');
  assert.equal(decide(r, 'bash', 'ls'), 'allow');
  assert.equal(decide(r, 'bash', 'git commit -m x'), 'allow');
  assert.equal(decide(r, 'bash', 'whoami'), 'ask', 'unknown commands go to the player');
  assert.equal(decide(r, 'bash', 'node app.js'), 'ask', 'running code needs the scripts level');
  for (const c of ['curl https://x', 'wget x', 'sudo ls', 'printenv', 'env', 'npm install left-pad', 'git push origin', 'find . -exec rm {} ;', 'powershell -c x', 'bash -c "curl x"', 'chmod 777 a'])
    assert.equal(decide(r, 'bash', c), 'deny', c);
  assert.equal(decide(r, 'webfetch', 'https://x'), 'deny');
  assert.equal(decide(r, 'task', 'general'), 'deny');
  assert.equal(decide(r, 'question', '*'), 'deny');
});

test('rules: scripts level, auto-reject, no shell', () => {
  const trusted = loadConfig({ SANDBOX_TRUSTED: '1' });
  const s = permissionRules(clampLimits({ shell: 'scripts' }, trusted));
  assert.equal(decide(s, 'bash', 'node app.js'), 'allow');
  assert.equal(decide(s, 'bash', 'npm test'), 'allow');
  assert.equal(decide(s, 'bash', 'npm install x'), 'deny');
  const rej = permissionRules(clampLimits({ approvals: 'reject' }, cfg));
  assert.equal(decide(rej, 'bash', 'whoami'), 'deny');
  const none = permissionRules(clampLimits({ shell: 'none' }, cfg));
  assert.equal(decide(none, 'bash', 'ls'), 'deny');
  assert.equal(decide(none, 'read', 'a.txt'), 'allow');
});

test('redactor removes secrets everywhere', () => {
  const r = createRedactor(['sk-ant-1234567890', 'short']);
  assert.deepEqual(r({ a: 'key=sk-ant-1234567890!', b: ['x sk-ant-1234567890'], c: 3, d: 'short' }), { a: 'key=[segredo removido]!', b: ['x [segredo removido]'], c: 3, d: 'short' });
});

test('models and prompts', () => {
  assert.equal(modelAllowed('opencode/big-pickle', cfg), true);
  assert.equal(modelAllowed('anthropic/claude-sonnet-4', cfg), true);
  assert.equal(modelAllowed('anthropic/claude-opus-4', cfg), false);
  assert.equal(modelAllowed('../etc', cfg), false);
  assert.throws(() => checkPrompt('   ', cfg));
  assert.throws(() => checkPrompt('x'.repeat(5000), cfg));
  assert.equal(checkPrompt('  oi ', cfg), 'oi');
});
