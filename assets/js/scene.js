/* DataLab — scene: camera, collision, NPCs, telemetry, rendering.
   Shared by the landing page (attract mode) and the playable demo. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Actor {
    constructor(look, x, y, dir) {
      this.look = look;
      this.sheet = DL.makeSheet(look);
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.dir = dir || 'down';
      this.dist = 0;
      this.moving = false;
      this.blinkIn = 1.5 + Math.random() * 3;
      this.blinkT = 0;
    }
    tick(dt) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkT = 0.13;
        this.blinkIn = 2.4 + Math.random() * 3.2;
      }
      if (this.blinkT > 0) this.blinkT -= dt;
    }
    frame() {
      const f = this.sheet[this.dir];
      if (!this.moving) {
        if (this.blinkT > 0) return f.blink;
        // skins that breathe while standing (cosmetics.js): the idle frame and the one a pixel lower
        return f.sway && DL.idleSway(performance.now() / 1000) ? f.sway : f.idle;
      }
      return f.walk[Math.floor(this.dist / 6.5) % 4];
    }
  }
  DL.Actor = Actor;

  const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
  DL.dirOf = dirOf;

  class Scene {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ tilesWide: 22, minTilesHigh: 11, attract: false, zoom: 0 }, opts);
      this.world = this.o.world || DL.buildWorld();
      this.floor = (this.o.renderFloor || DL.renderStatic)(this.world);
      this.mapW = this.world.W * T;
      this.mapH = this.world.H * T;
      this.t = 0;
      this.simAcc = 0;
      this.cam = { x: this.mapW / 2, y: this.mapH / 2 };
      this.npcs = [];
      this.actors = [];
      this.player = null;
      this.incident = { active: false, resolved: false, flash: 0 };
      this.overlay = null;
      this.ox = 0;
      this.oy = 0;
      for (const def of this.world.npcs) {
        const a = new Actor(DL.LOOKS[def.look], def.path[0].x, def.path[0].y, 'down');
        a.def = def;
        a.i = 1;
        a.wait = Math.random() * 1.5;
        a.talkT = 0;
        a.lineIdx = 0;
        this.npcs.push(a);
      }
      this.drawables = this.world.items.filter((e) => e.kind !== 'videowall').concat(this.npcs);
      this.resize();
    }

    addPlayer(look, x, y, dir) {
      this.player = new Actor(look, x, y, dir);
      this.drawables.push(this.player);
      this.cam.x = x;
      this.cam.y = y;
      return this.player;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      const sW = Math.round(this.canvas.width / (this.o.tilesWide * T));
      const sH = Math.floor(this.canvas.height / (this.o.minTilesHigh * T));
      this.autoS = Math.max(2, Math.min(sW, sH || sW));
      this.S = Math.max(this.o.minS || 2, this.autoS + (this.o.zoom || 0));
    }

    // Re-render the floor and rebuild the draw list after the map or its items change.
    refreshWorld(floorChanged) {
      if (floorChanged) {
        this.floor = (this.o.renderFloor || DL.renderStatic)(this.world);
        this.mapW = this.world.W * T;
        this.mapH = this.world.H * T;
      }
      this.drawables = this.world.items.filter((e) => e.kind !== 'videowall').concat(this.npcs, this.actors);
      if (this.player) this.drawables.push(this.player);
    }

    screenToWorld(sx, sy) {
      return { x: (sx * this.dpr + this.ox) / this.S, y: (sy * this.dpr + this.oy) / this.S };
    }
    // a drag on screen (css px) as a move in the world (iso.js turns it for the isometric camera)
    screenDelta(dx, dy) {
      return { x: (dx * this.dpr) / this.S, y: (dy * this.dpr) / this.S };
    }
    screenDir(dx, dy) {
      return { x: dx, y: dy };
    }
    // the tiles currently on screen
    tileRange() {
      const S = this.S, W = this.world.W, H = this.world.H;
      return {
        x0: Math.max(0, Math.floor(this.ox / S / T)), y0: Math.max(0, Math.floor(this.oy / S / T)),
        x1: Math.min(W - 1, Math.ceil((this.ox + this.canvas.width) / S / T)), y1: Math.min(H - 1, Math.ceil((this.oy + this.canvas.height) / S / T)),
      };
    }

    /* ---------- collision ---------- */
    solidAt(x, y) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (tx < 0 || ty < 0 || tx >= this.world.W || ty >= this.world.H) return true;
      return this.world.solid[ty * this.world.W + tx] === 1;
    }
    hits(x, y) {
      return this.solidAt(x - 5, y - 4) || this.solidAt(x + 5, y - 4) || this.solidAt(x - 5, y - 0.5) || this.solidAt(x + 5, y - 0.5);
    }
    // Axis-separated movement with corner nudging, so the player slides around edges instead of snagging.
    moveActor(a, dx, dy) {
      if (dx) {
        if (!this.hits(a.x + dx, a.y)) a.x += dx;
        else if (!this.nudge(a, dx, 'y')) {
          const s = Math.sign(dx) * 0.25;
          for (let n = 0; n < 8 && !this.hits(a.x + s, a.y); n++) a.x += s;
          a.vx = 0;
        }
      }
      if (dy) {
        if (!this.hits(a.x, a.y + dy)) a.y += dy;
        else if (!this.nudge(a, dy, 'x')) {
          const s = Math.sign(dy) * 0.25;
          for (let n = 0; n < 8 && !this.hits(a.x, a.y + s); n++) a.y += s;
          a.vy = 0;
        }
      }
    }
    nudge(a, d, axis) {
      for (let k = 1; k <= 6; k++) {
        for (const s of [1, -1]) {
          const ox = axis === 'x' ? s * k : 0, oy = axis === 'y' ? s * k : 0;
          const free = axis === 'y' ? !this.hits(a.x + d, a.y + oy) && !this.hits(a.x, a.y + oy) : !this.hits(a.x + ox, a.y + d) && !this.hits(a.x + ox, a.y);
          if (free) {
            const step = Math.min(k, Math.abs(d) * 0.9 + 0.2) * s;
            if (axis === 'y') a.y += step;
            else a.x += step;
            return true;
          }
        }
      }
      return false;
    }

    /* ---------- incident ---------- */
    setIncident(on) {
      const w = this.world;
      const sw = w.byId['SW-ACC-B'];
      sw.state = on ? 'down' : 'ok';
      sw.alert = on;
      w.byId['SW-CORE-01'].coreLinkDown = on;
      w.byId['PC-NOC-01'].alert = on;
      w.byId['PC-NOC-03'].alert = on;
      for (const e of w.rows.B) {
        e.state = on ? 'warn' : 'ok';
        e.recoverAt = 0;
      }
      this.incident.active = on;
      this.incident.resolved = false;
    }
    resolveIncident() {
      const w = this.world;
      w.byId['SW-ACC-B'].state = 'ok';
      w.byId['SW-ACC-B'].alert = false;
      w.byId['SW-CORE-01'].coreLinkDown = false;
      w.byId['PC-NOC-01'].alert = false;
      w.byId['PC-NOC-03'].alert = false;
      // racks come back one by one, starting next to the switch
      w.rows.B.slice().reverse().forEach((e, i) => (e.recoverAt = this.t + 0.35 + i * 0.14));
      this.incident.resolved = true;
      this.incident.flash = 1;
    }

    /* ---------- simulation ---------- */
    update(dt) {
      this.t += dt;
      const w = this.world;

      for (const e of w.rows.B) {
        if (e.recoverAt && this.t >= e.recoverAt) {
          e.state = 'ok';
          e.recoverAt = 0;
        }
      }
      if (this.incident.flash > 0) this.incident.flash = Math.max(0, this.incident.flash - dt * 0.6);

      this.simAcc += dt;
      if (this.simAcc >= 0.5) {
        this.simAcc = 0;
        for (const e of w.interactables) {
          if (!e.tel) continue;
          const isolated = e.state === 'warn';
          const tt = e.tel.temp - (isolated ? 0.9 : 0);
          const tp = e.tel.power * (isolated ? 0.9 : 1);
          e.temp += (tt - e.temp) * 0.15 + (Math.random() - 0.5) * e.tel.jitter;
          e.power += (tp - e.power) * 0.2 + (Math.random() - 0.5) * e.tel.power * 0.012;
          e.hist.temp.push(e.temp);
          e.hist.power.push(e.power);
          if (e.hist.temp.length > 40) e.hist.temp.shift();
          if (e.hist.power.length > 40) e.hist.power.shift();
        }
      }

      for (const n of this.npcs) this.updateNpc(n, dt);
      if (this.player) this.player.tick(dt);

      if (this.o.attract) {
        const vw = this.canvas.width / this.S, vh = this.canvas.height / this.S;
        const ax = Math.max(0, this.mapW / 2 - vw / 2), ay = Math.max(0, this.mapH / 2 - vh / 2);
        this.cam.x = this.mapW / 2 + 40 + ax * Math.sin(this.t * 0.06);
        this.cam.y = this.mapH / 2 + ay * Math.sin(this.t * 0.085 + 0.6);
      }
    }

    updateNpc(n, dt) {
      n.tick(dt);
      const p = this.player;
      if (n.talkT > 0) {
        n.talkT -= dt;
        n.moving = false;
        if (p) n.dir = dirOf(p.x - n.x, p.y - n.y);
        return;
      }
      if (n.wait > 0) {
        n.wait -= dt;
        n.moving = false;
        return;
      }
      const tgt = n.def.path[n.i];
      const dx = tgt.x - n.x, dy = tgt.y - n.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.6) {
        n.x = tgt.x;
        n.y = tgt.y;
        n.wait = n.def.waits[n.i] || 0;
        n.i = (n.i + 1) % n.def.path.length;
        if (n.wait > 0.8) n.dir = n.y < 9 * T ? 'up' : n.dir;
        n.moving = false;
        return;
      }
      const sp = 30 * dt;
      const ux = dx / d, uy = dy / d;
      // politely wait if the player is standing in the way
      if (p && Math.hypot(p.x - (n.x + ux * 12), p.y - (n.y + uy * 12)) < 11) {
        n.moving = false;
        n.dir = dirOf(ux, uy);
        return;
      }
      const step = Math.min(sp, d);
      if (!n.moving) n.dist = 0;
      n.x += ux * step;
      n.y += uy * step;
      n.dist += step;
      n.moving = true;
      n.dir = dirOf(ux, uy);
    }

    /* ---------- rendering ---------- */
    // lift: height above the floor point (world px), e.g. a name tag over someone's head
    worldToScreen(wx, wy, lift) {
      return { x: (wx * this.S - this.ox) / this.dpr, y: ((wy - (lift || 0)) * this.S - this.oy) / this.dpr };
    }

    render() {
      const g = this.ctx, S = this.S, cw = this.canvas.width, ch = this.canvas.height;
      const vw = cw / S, vh = ch / S;
      const cx = vw >= this.mapW ? this.mapW / 2 : clamp(this.cam.x, vw / 2, this.mapW - vw / 2);
      // padTop (css px) keeps the north wall visible below an overlaid HUD bar
      const pt = ((this.o.padTop || 0) * this.dpr) / S;
      // padBottom (css px) does the same for a panel docked at the bottom (0 unless a page sets it)
      const pb = ((this.o.padBottom || 0) * this.dpr) / S;
      // lift (css px): the camera's target shows that much higher, centred above a docked panel
      const lift = ((this.o.lift || 0) * this.dpr) / S;
      const cy = vh - pt - pb >= this.mapH ? this.mapH / 2 - pt / 2 + pb / 2 : clamp(this.cam.y + lift, vh / 2 - pt, this.mapH - vh / 2 + pb);
      this.ox = Math.round(cx * S - cw / 2);
      this.oy = Math.round(cy * S - ch / 2);

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#060709';
      g.fillRect(0, 0, cw, ch);
      g.setTransform(S, 0, 0, S, -this.ox, -this.oy);
      g.imageSmoothingEnabled = false;
      g.drawImage(this.floor, 0, 0);

      const inc = this.incident.active && !this.incident.resolved;
      // the NOC wall + its light belong to the DC-01 map; worlds built from scratch opt out
      const noc = this.world.hasVideoWall !== false;
      if (noc) DL.drawVideoWall(g, this.t, inc);

      const x0 = this.ox / S - 40, x1 = (this.ox + cw) / S + 40;
      const y0 = this.oy / S - 20, y1 = (this.oy + ch) / S + 40;
      const list = this.drawables;
      for (const d of list) d._k = d instanceof Actor ? (d.sortKey != null ? d.sortKey : d.y + 0.1) : d.sortY;
      list.sort((a, b) => a._k - b._k);
      if (this.underlay) this.underlay(g, this);
      for (const d of list) {
        if (d instanceof Actor) {
          if (d.hidden || this.peopleAlpha === 0 || d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1 + 30) continue;
          DL.drawActor(g, d, S);
        } else {
          if (d.px > x1 || d.px + d.tw * T < x0 || d.py > y1 || d.py + T < y0) continue;
          DL.drawItem(g, d, this.t);
        }
      }

      // dynamic light
      g.globalCompositeOperation = 'lighter';
      if (noc) DL.pool(g, 88, 44, 72, inc ? 'rgba(255,122,23,0.06)' : 'rgba(160,195,236,0.05)');
      if (inc) {
        const sw = this.world.byId['SW-ACC-B'];
        const a = 0.13 + 0.07 * Math.sin(this.t * 3);
        DL.pool(g, sw.px + 8, sw.py - 2, 46, 'rgba(255,122,23,' + a.toFixed(3) + ')');
      }
      if (this.incident.flash > 0) {
        const a = 0.16 * this.incident.flash;
        DL.pool(g, 16 * T, 10 * T, 90, 'rgba(126,224,161,' + a.toFixed(3) + ')');
      }
      if (this.lights) this.lights(g, this);
      g.globalCompositeOperation = 'source-over';

      if (this.overlay) this.overlay(g, this);
    }

    start(step) {
      if (this.running) return;
      this.running = true;
      let last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (step) step(dt);
        this.update(dt);
        // while the menu covers the game (phone.js sets o.calm) the world keeps running but is not redrawn:
        // the last picture stays behind the menu, blurred once by CSS, and the menu gets all the time
        if (!this.o.calm) this.render();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  DL.Scene = Scene;
})();
