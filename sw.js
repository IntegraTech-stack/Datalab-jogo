/* DataLab — service worker of the installed app (PWA on phones; mobile.js registers it, the PC never does).
   Network first for this site's own files, so a new deploy shows up at once; the last copy of each file
   stays in the cache and opens the game when the connection drops. Supabase, Spotify, YTMDesktop (127.0.0.1)
   and fonts go straight to the network, untouched. */
const CACHE = 'datalab-v1';
const SHELL = ['jogo.html', 'manifest.webmanifest', 'assets/img/icon-192.png', 'assets/img/icon-512.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  ev.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('jogo.html') : Response.error())))
  );
});
