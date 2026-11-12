// `npm run dev:local`: the app pointed at the game of this checkout (scripts/serve.mjs) instead of the
// published site, to try changes to the game / desktop.js before they are deployed.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn(process.execPath, [path.join(desktop, 'scripts', 'serve.mjs')], { stdio: 'inherit' });
// through the shell: on Windows `npx` is npx.cmd, which Node can't start directly
const app = spawn('npx tauri dev', {
  cwd: desktop,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATALAB_URL: 'http://127.0.0.1:1420/jogo.html' },
});
const stop = () => { server.kill(); app.kill(); };
app.on('exit', (code) => { server.kill(); process.exit(code || 0); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
