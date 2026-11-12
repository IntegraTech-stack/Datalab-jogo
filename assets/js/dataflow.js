/* DataLab — dataflow (Fluxo de dados): little lights running along the floor from every rack with an
   online server to the rack of the switch it is plugged into. Purely visual: no rule, money or save
   changes. A route is an "L" on the floor grid (first along x, then along y) from the base of one rack
   to the base of the other; all the servers of one rack going to the same switch share one route, which
   just gets busier. Colour follows the switch's uplink load (ops.netOf): turquoise, yellow above 0.8,
   red above 1; more load = more dots, faster. Each dot is a single number (its place on the route, 0..1),
   at most 6 per route and 120 in all. Routes are rebuilt on the game's 'cables' / 'world' events (and
   when a fault opens or closes), never per frame. With prefers-reduced-motion only the still trace is
   drawn. setPower(false) slows the dots down and fades them out in a second (the blackout, later);
   setPower(true) brings them back little by little. Drawn in the scene's underlay (demo.js), on the
   floor, under people and furniture, next to trails.draw. */
(function () {
  'use strict';
  const DL = window.DL;
  const T = DL.T || 16;
  const MAX_ROUTE = 6, MAX = 120; // dots per route / in all
  const REFRESH = 2; // s between quiet re-reads (a server that boots up or goes down emits no event)
  const COL = { ok: '#2de2c8', warn: '#e8c15a', bad: '#f2495c' };
  const rgba = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const colorOf = (load) => (load > 1 ? COL.bad : load > 0.8 ? COL.warn : COL.ok);

  DL.createDataflow = function (game, sys) {
    const reduced = !!(sys && sys.reduced);
    // route: { from, to (rack entities), pts [[x,y]…], len, n (servers), load, col, speed (px/s), want, dots [k…] }
    let routes = [];
    let dirty = true, since = 0, clock = 0;
    let powerOn = true, power = 1; // 0..1: dots' speed and brightness

    // the base of a rack on the floor: the middle of its front edge, a couple of px into the aisle
    const base = (e) => [Math.round(e.px + (e.tw * T) / 2), e.py + e.th * T + 2];
    // the "L": along x first, then along y
    function shape(a, b) {
      const [ax, ay] = base(a), [bx, by] = base(b);
      const pts = ax === bx || ay === by ? [[ax, ay], [bx, by]] : [[ax, ay], [bx, ay], [bx, by]];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      return { pts, len };
    }
    // where a dot at k (0..1) is on the route
    function at(r, k) {
      let d = k * r.len;
      for (let i = 1; i < r.pts.length; i++) {
        const [x0, y0] = r.pts[i - 1], [x1, y1] = r.pts[i], l = Math.abs(x1 - x0) + Math.abs(y1 - y0);
        if (d <= l || i === r.pts.length - 1) { const f = l ? Math.min(1, d / l) : 1; return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]; }
        d -= l;
      }
      return r.pts[0];
    }

    function rebuild() {
      const ops = sys && sys.ops;
      if (!ops) return;
      const next = [];
      for (const d of ops.devices()) {
        if (d.kind !== 'server' || d.state !== 'online' || d.fault) continue;
        const t = d.path || ops.trace(d);
        if (!t || !t.ok || !t.sw || !t.sw.rack || !d.rack || t.sw.rack === d.rack) continue;
        if (!ops.health(d).up) continue;
        let r = next.find((x) => x.from === d.rack && x.to === t.sw.rack);
        if (!r) {
          r = Object.assign({ from: d.rack, to: t.sw.rack, n: 0, load: 0, dots: [] }, shape(d.rack, t.sw.rack));
          const old = routes.find((x) => x.from === r.from && x.to === r.to);
          if (old) r.dots = old.dots; // the lights already running stay where they are
          next.push(r);
        }
        r.n++;
        const net = ops.netOf(d);
        r.load = Math.max(r.load, (net && net.load) || 0);
      }
      let total = 0;
      for (const r of next) {
        r.col = colorOf(r.load);
        r.speed = 36 + Math.min(r.load, 1.5) * 50;
        r.want = Math.min(MAX_ROUTE, Math.ceil(1 + r.n * 0.5 + Math.min(r.load, 1.5) * 2.5));
        total += r.want;
      }
      if (total > MAX) for (const r of next) r.want = Math.max(1, Math.floor((r.want * MAX) / total)); // never more than MAX in all
      for (const r of next) {
        while (r.dots.length > r.want) r.dots.pop();
        while (r.dots.length < r.want) r.dots.push(r.dots.length / r.want); // spread along the route
      }
      routes = next;
      dirty = false;
      since = 0;
    }
    const mark = () => { dirty = true; };
    game.on('cables', mark);
    game.on('world', mark);
    game.on('fault', mark);
    game.on('fixed', mark);

    function update(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      since += dt;
      if (dirty || since >= REFRESH) rebuild();
      // the blackout: off → slow down and fade in 1 s; on → come back over 2 s
      power = powerOn ? Math.min(1, power + dt / 2) : Math.max(0, power - dt);
      if (reduced || power <= 0) return;
      for (const r of routes) {
        const step = (r.speed * power * dt) / (r.len || 1);
        for (let i = 0; i < r.dots.length; i++) { r.dots[i] += step; if (r.dots[i] >= 1) r.dots[i] -= 1; }
      }
    }
    // the scene's underlay: g is already in the floor's space, so these are world px
    function draw(g, sc) {
      if (!routes.length) return;
      for (const r of routes) {
        // the faint trace of the route
        const tc = rgba(r.col, 0.1 + 0.03 * Math.min(r.n, 4));
        for (let i = 1; i < r.pts.length; i++) {
          const [x0, y0] = r.pts[i - 1], [x1, y1] = r.pts[i];
          R(g, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1, tc);
        }
        if (reduced || power <= 0) continue;
        // the dots: 1–2 px, a soft glow around each
        for (let i = 0; i < r.dots.length; i++) {
          const [x, y] = at(r, r.dots[i]), X = Math.round(x), Y = Math.round(y);
          const big = r.load > 0.8 || (i + Math.floor(clock * 6)) % 3 === 0, s = big ? 2 : 1;
          R(g, X - 1, Y - 1, s + 2, s + 2, rgba(r.col, 0.22 * power));
          R(g, X, Y, s, s, rgba(r.col, 0.95 * power));
          if (big) R(g, X, Y, 1, 1, rgba('#ffffff', 0.7 * power));
        }
      }
    }
    function setPower(on) { powerOn = !!on; }
    return { update, draw, setPower, rebuild: mark, get routes() { return routes; }, get count() { return routes.reduce((s, r) => s + r.dots.length, 0); }, MAX };
  };
})();
