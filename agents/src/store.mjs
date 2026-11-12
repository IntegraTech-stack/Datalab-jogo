// DataLab · what the gateway remembers, as JSON files under AGENT_DATA_DIR (one folder per player):
//   users/<uid>/settings.json      the player's limits + per-employee agent choice
//   users/<uid>/usage.json         today's count of tasks / tokens / cost (daily quotas)
//   users/<uid>/tasks/<id>.json    one task: prompt, events, result, usage (the history)
// Writes are atomic (temp file + rename) and serialized per file. Small enough for a game; the
// interface (get/put) is what a database-backed store would implement later.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const UID = /^[0-9a-f-]{36}$/;
const TASK_ID = /^t_[a-z0-9]{6,40}$/;
const MAX_TASKS_KEPT = 200;

export function createStore(dataDir) {
  const chains = new Map();
  const userDir = (uid) => {
    if (!UID.test(uid)) throw new Error('bad uid');
    return path.join(dataDir, 'users', uid);
  };

  async function readJson(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
  }
  function writeJson(file, value) {
    const prev = chains.get(file) || Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(value));
      await fs.rename(tmp, file);
    });
    chains.set(file, next);
    next.finally(() => { if (chains.get(file) === next) chains.delete(file); }).catch(() => {});
    return next;
  }

  const today = () => new Date().toISOString().slice(0, 10);

  return {
    newTaskId: () => 't_' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex'),

    getSettings: (uid) => readJson(path.join(userDir(uid), 'settings.json'), {}),
    putSettings: (uid, s) => writeJson(path.join(userDir(uid), 'settings.json'), s),

    async getUsage(uid) {
      const u = await readJson(path.join(userDir(uid), 'usage.json'), null);
      return u && u.day === today() ? u : { day: today(), tasks: 0, tokens: 0, costUsd: 0 };
    },
    async addUsage(uid, delta) {
      const u = await this.getUsage(uid);
      u.tasks += delta.tasks || 0;
      u.tokens += delta.tokens || 0;
      u.costUsd = Math.round((u.costUsd + (delta.costUsd || 0)) * 1e6) / 1e6;
      await writeJson(path.join(userDir(uid), 'usage.json'), u);
      return u;
    },

    async getTask(uid, id) {
      if (!TASK_ID.test(id)) return null;
      return readJson(path.join(userDir(uid), 'tasks', id + '.json'), null);
    },
    putTask: (uid, task) => writeJson(path.join(userDir(uid), 'tasks', task.id + '.json'), task),

    // newest first; the oldest beyond MAX_TASKS_KEPT are deleted
    async listTasks(uid, filter = {}) {
      const dir = path.join(userDir(uid), 'tasks');
      let names = [];
      try { names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')); } catch { return []; }
      names.sort().reverse(); // ids start with a base-36 timestamp
      for (const old of names.slice(MAX_TASKS_KEPT)) fs.rm(path.join(dir, old), { force: true }).catch(() => {});
      const out = [];
      for (const n of names.slice(0, MAX_TASKS_KEPT)) {
        const t = await readJson(path.join(dir, n), null);
        if (!t || (filter.employee && t.employee.id !== filter.employee)) continue;
        out.push(t);
        if (out.length >= (filter.limit || 50)) break;
      }
      return out;
    },

    // where an employee works: one folder per (player, employee), kept between tasks
    workspaceOf: (uid, employeeId) => path.join(dataDir, 'workspaces', userDirName(uid), employeeId),
  };
}

// workspaces are not named after the raw user id (paths show up in agent output)
const userDirName = (uid) => crypto.createHash('sha256').update(uid).digest('hex').slice(0, 16);
