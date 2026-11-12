/* DataLab — simulated music for the bots (no Spotify: a made-up catalog, all bands and songs are fictional).
   Each bot gets a taste (genre) from its id, plays that genre's playlist on loop and pauses while it
   talks or is off shift. crew.js shows it on the nametag (♪) and in the bot's card. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  // [title, artist] per genre; durations come from the title hash (2:30 to 4:20)
  const GENRES = [
    { id: 'lofi', name: 'Lo-fi', colors: ['#6b7cff', '#c38bff'], tracks: [
      ['Café & Commits', 'Lofi do Rack'], ['Chuva no Datacenter', 'Lofi do Rack'], ['Ping 12ms', 'Beatriz Beats'],
      ['Madrugada de Deploy', 'Soneca.exe'], ['Ventoinha Suave', 'Soneca.exe']] },
    { id: 'synth', name: 'Synthwave', colors: ['#ff2bd6', '#2bd9ff'], tracks: [
      ['Neon Ethernet', 'Fibra Óptica'], ['Overclock 1987', 'Fibra Óptica'], ['Retrô Kernel', 'VHS Club'],
      ['Sinal Verde', 'VHS Club'], ['Noite em 8 Bits', 'Arcade Sul']] },
    { id: 'rock', name: 'Rock', colors: ['#ff4d3d', '#2a2a2e'], tracks: [
      ['Kernel Panic', 'Os Desfragmentados'], ['Tela Azul', 'Os Desfragmentados'], ['Root sem Senha', 'Banda Larga'],
      ['Firewall de Fogo', 'Banda Larga'], ['Reboot', 'Curto-Circuito']] },
    { id: 'sertanejo', name: 'Sertanejo', colors: ['#f2a24e', '#7a4a1f'], tracks: [
      ['Saudade do Wi-Fi', 'Zé Cabo & Conector'], ['Modem de Pião', 'Zé Cabo & Conector'], ['Coração Sem Sinal', 'Dupla Fibra'],
      ['Boteco do Servidor', 'Dupla Fibra'], ['A Ligação Caiu', 'Dupla Fibra']] },
    { id: 'funk', name: 'Funk', colors: ['#ffd23f', '#ff3d8b'], tracks: [
      ['Baile do Backup', 'MC Byte'], ['Tá Tranquilo, Tá Online', 'MC Byte'], ['Rebola o Rack', 'MC Latência'],
      ['Pancadão do Ping', 'MC Latência'], ['Bota o Cabo', 'DJ Patch']] },
    { id: 'pagode', name: 'Pagode', colors: ['#2fbf71', '#f2c14e'], tracks: [
      ['Samba do Switch', 'Grupo Gigabit'], ['Domingo de Manutenção', 'Grupo Gigabit'], ['Roda de Log', 'Pagode.zip'],
      ['Ninguém Lê o Manual', 'Pagode.zip'], ['Cerveja e Cache', 'Grupo Gigabit']] },
    { id: 'eletronica', name: 'Eletrônica', colors: ['#00e0b0', '#3a2bff'], tracks: [
      ['Packet Loss', 'DJ Router'], ['Bassline de 10 Gbps', 'DJ Router'], ['Latência Zero', 'Nuvem Privada'],
      ['Loop Infinito', 'Nuvem Privada'], ['Handshake', 'Kilobyte']] },
    { id: 'mpb', name: 'MPB', colors: ['#4ec3e0', '#e0c27a'], tracks: [
      ['Garoa no Cabo', 'Lúcia Lan'], ['Mar de Pixels', 'Lúcia Lan'], ['Ainda Compila', 'Tom Terminal'],
      ['Canção do Uptime', 'Tom Terminal'], ['Paleta de Logs', 'Tom Terminal']] },
  ];

  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const durOf = (t) => 150 + (hash(t[0]) % 111);

  // per bot: where it is in its playlist (kept off the crew object so it never reaches the save)
  const PLAY = new WeakMap();

  // a bot is listening unless it is talking, leaving or off shift
  function playingNow(c) {
    if (!c || c.off || c.state === 'leaving' || c.state === 'off' || c.state === 'talking') return false;
    return !(c.talkT > 0 && c.talkWith);
  }

  // what this bot is listening to right now: { playing, title, artist, genre, colors, pos, dur }
  function of(a) {
    const c = a && a.crew;
    if (!c) return null;
    let m = PLAY.get(a);
    const now = performance.now();
    if (!m) {
      const h = hash(c.id || c.name);
      const g = GENRES[h % GENRES.length];
      const i = (h >>> 8) % g.tracks.length;
      m = { g, i, pos: ((h >>> 16) % 1000) / 1000 * durOf(g.tracks[i]), t: now };
      PLAY.set(a, m);
    }
    const playing = playingNow(c);
    if (playing) {
      m.pos += Math.min(600, (now - m.t) / 1000);
      while (m.pos >= durOf(m.g.tracks[m.i])) { m.pos -= durOf(m.g.tracks[m.i]); m.i = (m.i + 1) % m.g.tracks.length; }
    }
    m.t = now;
    const tr = m.g.tracks[m.i];
    return { playing, title: tr[0], artist: tr[1], genre: m.g.name, colors: m.g.colors, pos: m.pos, dur: durOf(tr) };
  }

  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  /* ---------------- album covers: 24×24 pixel art, one motif per genre, varied per song ---------------- */
  const N = 24;
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { a = rgb(a); b = rgb(b); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const COVERS = new Map();

  const MOTIF = {
    lofi(d, r, c) {   // night window: stars, crescent moon, hills
      const sky = mix(c[0], '#141433', 0.35);
      d.vgrad(0, N, '#141433', sky);
      for (let i = 0; i < 7; i++) d.px(r(N), r(14), i % 3 ? '#cfd4ff' : '#ffffff');
      const mx = 5 + r(12), my = 4 + r(4);
      d.circle(mx, my, 4, '#f4e7c1');
      d.circle(mx + 2, my - 1, 3.5, (py) => mix('#141433', sky, py / (N - 1)));
      for (let x = 0; x < N; x++) { const h = 4 + Math.round(2 * Math.sin(x / 3 + r(6)) + 1.5 * Math.sin(x / 7)); d.rect(x, N - h, 1, h, mix(c[1], '#141433', 0.65)); }
    },
    synth(d, r, c) {   // striped sunset over a neon grid
      d.vgrad(0, 15, '#1a0633', mix(c[0], '#1a0633', 0.4));
      const sx = 9 + r(6);
      for (let y = 4; y < 15; y++) for (let x = sx - 7; x <= sx + 7; x++) if ((x - sx) ** 2 + (y - 11) ** 2 <= 49 && !(y > 9 && y % 2 === 0)) d.px(x, y, mix('#ffd23f', c[0], (y - 4) / 11));
      d.rect(0, 15, N, 9, '#1a0633');
      for (let k = -3; k <= 3; k++) for (let y = 15; y < N; y++) d.px(Math.round(12 + k * (1.5 + (y - 15) * 0.9)), y, mix(c[1], '#1a0633', 0.35));
      for (const y of [15, 17, 20]) d.rect(0, y, N, 1, c[1]);
    },
    rock(d, r, c) {   // lightning bolt on black
      d.vgrad(0, N, '#2a2a2e', '#0a0a0b');
      const o = r(5) - 2, bolt = [[15 + o, 2], [8 + o, 12], [13 + o, 12], [7 + o, 22]];
      for (let i = 0; i < 3; i++) d.line(bolt[i], bolt[i + 1], 2, i % 2 ? '#ffd23f' : c[0]);
      for (let i = 0; i < 5; i++) d.px(r(N), r(N), mix(c[0], '#ffffff', 0.4));
    },
    sertanejo(d, r, c) {   // sunset over the field, fence
      d.vgrad(0, 16, '#ffcf7a', c[0]);
      d.circle(6 + r(12), 9, 3 + r(2), '#fff3c4');
      for (let x = 0; x < N; x++) { const h = 7 + Math.round(1.5 * Math.sin(x / 4 + r(6))); d.rect(x, N - h, 1, h, c[1]); }
      for (let x = 1; x < N; x += 5) d.rect(x, 15, 1, 5, '#3d2410');
      d.rect(0, 16, N, 1, '#3d2410');
    },
    funk(d, r, c) {   // speaker box on a loud background with sound rings
      d.rect(0, 0, N, N, c[0]);
      for (let k = 0; k < 4; k++) d.ring(12, 12, 9 + k * 3, mix(c[1], c[0], 0.3 + k * 0.15));
      d.rect(6, 3, 12, 18, '#16161a');
      d.circle(12, 8, 3, c[1]); d.circle(12, 8, 1, '#16161a');
      d.circle(12, 15, 4, c[1]); d.circle(12, 15, 1.5, '#16161a');
    },
    pagode(d, r, c) {   // pandeiro: skin, rim, jingles
      d.rect(0, 0, N, N, mix(c[0], '#0a3d22', 0.35));
      for (let i = 0; i < 6; i++) d.px(r(N), r(N), mix(c[0], '#ffffff', 0.3));
      d.circle(12, 12, 9, c[1]); d.circle(12, 12, 7, '#f6e7c8');
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + r(10) / 40; d.rect(Math.round(12 + 8 * Math.cos(a)) - 1, Math.round(12 + 8 * Math.sin(a)) - 1, 2, 2, '#e0e0e8'); }
    },
    eletronica(d, r, c) {   // equalizer bars
      d.vgrad(0, N, '#0b0b1a', mix(c[1], '#0b0b1a', 0.6));
      for (let x = 2; x < N - 1; x += 3) { const h = 4 + r(16); for (let y = 0; y < h; y++) d.rect(x, N - 2 - y, 2, 1, mix(c[0], c[1], y / 18)); }
    },
    mpb(d, r, c) {   // sun over the sea
      d.vgrad(0, 13, c[1], '#ffe9c2');
      d.circle(7 + r(10), 10, 3 + r(2), '#fff6dc');
      for (let y = 13; y < N; y++) d.rect(0, y, N, 1, mix(c[0], '#13466b', (y - 13) / 11));
      for (let y = 15; y < N; y += 3) for (let x = (y * 2 + r(3)) % 6; x < N; x += 6) d.rect(x, y, 3, 1, '#d9f4ff');
    },
  };

  function hueRotate(x, deg) {
    const img = x.getImageData(0, 0, N, N), p = img.data;
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
    // standard hue-rotate matrix (same as the CSS filter), done by hand: ctx.filter is missing on older Safari
    const m = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      p[i] = r * m[0] + g * m[1] + b * m[2];
      p[i + 1] = r * m[3] + g * m[4] + b * m[5];
      p[i + 2] = r * m[6] + g * m[7] + b * m[8];
    }
    x.putImageData(img, 0, 0);
  }

  // data: URL of a song's cover, drawn once and cached
  function cover(title, genreName) {
    const key = genreName + '|' + title;
    if (COVERS.has(key)) return COVERS.get(key);
    const g = GENRES.find((x) => x.name === genreName) || GENRES[0];
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const x = cv.getContext('2d');
    let seed = hash(title) || 1;
    const r = (n) => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed % n; };
    const d = {
      px(px, py, col) { if (px >= 0 && py >= 0 && px < N && py < N) { x.fillStyle = col; x.fillRect(px, py, 1, 1); } },
      rect(px, py, w, h, col) { x.fillStyle = col; x.fillRect(px, py, w, h); },
      vgrad(y0, y1, a, b) { for (let y = y0; y < y1; y++) d.rect(0, y, N, 1, mix(a, b, (y - y0) / Math.max(1, y1 - y0 - 1))); },
      // col can be a function of the row (paint the sky back over the moon: crescent)
      circle(cx, cy, rad, col) {
        for (let py = Math.floor(cy - rad); py <= cy + rad; py++) for (let px = Math.floor(cx - rad); px <= cx + rad; px++) {
          if ((px - cx) ** 2 + (py - cy) ** 2 <= rad * rad) d.px(px, py, typeof col === 'function' ? col(py) : col);
        }
      },
      ring(cx, cy, rad, col) { for (let a = 0; a < 360; a += 4) d.px(Math.round(cx + rad * Math.cos(a * Math.PI / 180)), Math.round(cy + rad * Math.sin(a * Math.PI / 180)), col); },
      line(a, b, w, col) { const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); for (let i = 0; i <= n; i++) d.rect(Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n), w, w, col); },
    };
    // each song of a genre leans to a different shade of the genre's colours
    const shade = r(3) / 6;
    MOTIF[g.id](d, r, [mix(g.colors[0], g.colors[1], shade), mix(g.colors[1], g.colors[0], shade / 2)]);
    // and its own hue: the 5 songs of a genre don't share one cover
    const deg = [0, 32, -32, 64, -64][Math.max(0, g.tracks.findIndex((t) => t[0] === title)) % 5];
    if (deg) hueRotate(x, deg);
    const url = cv.toDataURL();
    COVERS.set(key, url);
    return url;
  }

  DL.BotMusic = { of, clock, cover };
})();
