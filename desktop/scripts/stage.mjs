// Builds desktop/dist: the character window (desktop/companion) + the game's own sprite code it draws
// the player with. Copied from the repo on every `tauri dev` / `tauri build`, so the skins drawn in the
// corner are always the ones of this checkout (no second copy to keep in sync by hand).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const repo = path.resolve(desktop, '..');
const dist = path.join(desktop, 'dist');

const FILES = [
  [path.join(desktop, 'companion', 'companion.html'), 'companion.html'],
  [path.join(desktop, 'companion', 'companion.css'), 'companion.css'],
  [path.join(desktop, 'companion', 'companion.js'), 'companion.js'],
  // the game's character art: body + clothes (sprites.js), shop / pass cosmetics (cosmetics.js), emotes
  [path.join(repo, 'assets', 'js', 'sprites.js'), 'game/sprites.js'],
  [path.join(repo, 'assets', 'js', 'cosmetics.js'), 'game/cosmetics.js'],
  [path.join(repo, 'assets', 'js', 'emotes.js'), 'game/emotes.js'],
];

fs.rmSync(dist, { recursive: true, force: true });
for (const [from, to] of FILES) {
  const out = path.join(dist, to);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(from, out);
}
console.log('desktop/dist pronto:', FILES.map(([, to]) => to).join(', '));
