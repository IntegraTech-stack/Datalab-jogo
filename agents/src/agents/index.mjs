// DataLab · the agents an employee can run. Each adapter implements the same contract:
//   { id, label, available, reason?, models(isAllowed) → [{ id, name, provider, free }],
//     start({ workspace, model, prompt, system, rules, maxSteps, title, onEvent, onSecrets })
//       → { done: Promise<{ text, files, usage }>, abort(reason), reply(approvalId, 'once'|'reject'), usage() } }
// and reports progress with the gateway's event set (status, step, text, thinking, tool, todo, file,
// approval, usage, retry, error). The UI only knows these events, so a new agent needs no UI work.
import { createOpenCodeAgent } from './opencode.mjs';
import { createMockAgent } from './mock.mjs';

// planned: shown in the game as "em breve", never started
const PLANNED = [
  { id: 'claude-code', label: 'Claude Code', available: false, reason: 'Em breve' },
  { id: 'codex', label: 'Codex', available: false, reason: 'Em breve' },
];

export function createAgents(cfg) {
  const list = [createOpenCodeAgent(cfg)];
  if (cfg.mockAgent) list.push(createMockAgent(cfg));
  for (const p of PLANNED) list.push({ ...p, models: async () => [], start() { throw new Error('agent not available'); } });
  const byId = new Map(list.map((a) => [a.id, a]));
  return { list, get: (id) => byId.get(id) || null };
}
