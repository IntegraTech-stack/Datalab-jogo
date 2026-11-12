// DataLab · a scripted agent for automated tests (AGENT_MOCK=1 only — never in production).
// It really writes a file in the workspace, asks for one approval when the prompt says "aprovar",
// runs long when it says "demorar" (to test stopping / timeouts) and burns steps when it says "passos".
import fs from 'node:fs/promises';
import path from 'node:path';

const sleep = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); signal && signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

export function createMockAgent() {
  return {
    id: 'mock', label: 'Mock (testes)', available: true,
    models: async (isAllowed) => [{ id: 'mock/fast', name: 'Mock rápido', provider: 'Mock', free: true }].filter((m) => isAllowed(m.id)),
    start(opts) {
      const emit = opts.onEvent;
      const ac = new AbortController();
      let aborted = null, steps = 0, tokens = 0;
      const approvals = new Map();
      const usage = () => ({ tokens, costUsd: 0, steps });
      const step = () => { steps++; tokens += 1000; emit({ type: 'step', n: steps }); emit({ type: 'usage', ...usage() }); };
      const done = (async () => {
        emit({ type: 'status', state: 'starting' });
        await sleep(50, ac.signal);
        emit({ type: 'status', state: 'running' });
        opts.onSecrets && opts.onSecrets(['mock-secret-value-123']);
        step();
        emit({ type: 'text', id: 'p1', text: 'Vou começar. mock-secret-value-123' });
        await fs.mkdir(opts.workspace, { recursive: true });
        emit({ type: 'tool', id: 'k1', tool: 'write', status: 'running', input: 'resultado.txt', output: '' });
        await fs.writeFile(path.join(opts.workspace, 'resultado.txt'), 'Feito por ' + opts.title + '\n' + opts.prompt + '\n');
        emit({ type: 'tool', id: 'k1', tool: 'write', status: 'completed', input: 'resultado.txt', output: 'Wrote file successfully.' });
        emit({ type: 'file', path: 'resultado.txt' });
        if (/aprovar/i.test(opts.prompt)) {
          const answer = await new Promise((resolve) => { approvals.set('per_mock1', resolve); emit({ type: 'approval', id: 'per_mock1', permission: 'bash', patterns: ['whoami'], command: 'whoami' }); ac.signal.addEventListener('abort', () => resolve('reject'), { once: true }); });
          emit({ type: 'tool', id: 'k2', tool: 'bash', status: answer === 'once' ? 'completed' : 'error', input: 'whoami', output: answer === 'once' ? 'agente' : 'O jogador recusou este comando.' });
        }
        if (/passos/i.test(opts.prompt)) for (let i = 0; i < 100 && !aborted; i++) { step(); await sleep(20, ac.signal); }
        if (/demorar/i.test(opts.prompt)) for (let i = 0; i < 600 && !aborted; i++) await sleep(100, ac.signal);
        step();
        if (aborted) throw Object.assign(new Error(aborted), { aborted: true, partial: { text: 'parcial', files: ['resultado.txt'], usage: usage() } });
        const text = 'Tarefa concluída: criei resultado.txt.';
        emit({ type: 'text', id: 'p2', text });
        return { text, files: ['resultado.txt'], usage: usage() };
      })();
      return {
        done,
        usage,
        async abort(reason) { aborted = reason || 'Interrompida'; ac.abort(); },
        async reply(id, answer) { const r = approvals.get(id); if (!r) return false; approvals.delete(id); r(answer); return true; },
      };
    },
  };
}
