/* DataLab — incident director: one place that decides WHEN something may go wrong.
   Faults (ops.js) and broken hardware (staff.js) keep their own "what breaks" logic, but they ask the
   director first. Rules: a calm start, one problem at a time (finish it before the next one), a gap
   after every incident starts and a breather after every incident is resolved. A critical incident
   (a switch dying takes servers down with it) may jump the queue, never more than two open at once.
   The learning mode stretches or shortens the gaps (DL.learn().incidentGap). */
(function () {
  'use strict';
  const DL = window.DL;

  DL.INCIDENTS = {
    warmup: 180,      // game minutes (= real seconds) of calm at the start of a session
    gap: 150,         // after an incident starts, before the next one may start
    calm: 80,         // after the last open incident is resolved
    maxOpen: 1,       // normal incidents only start when nothing else is open
    maxWithCritical: 2,
  };

  DL.createDirector = function (game, sys) {
    const I = DL.INCIDENTS;
    const D = { t: 0, lastStart: -1e9, lastResolved: -1e9, open: 0, log: [] };
    const k = () => (DL.learn ? DL.learn().incidentGap : 1);

    // everything that counts as "a problem in progress" — a fault someone on the team is already repairing
    // doesn't (staff.js incident orders take minutes; the pace of new incidents stays the same)
    function openNow() {
      const ops = sys.ops, staff = game.staff;
      let n = 0, critical = 0;
      if (ops) for (const d of ops.devices()) if (d.fault && !(staff && staff.handling && staff.handling(d))) n++;
      if (staff) for (const r of staff.broken()) { n++; if (r.kind === 'switch') critical++; }
      return { n, critical };
    }

    // May an incident of this kind start now?
    function canStart(kind, opts) {
      opts = opts || {};
      if (game.paused && game.paused()) return false;
      if (D.t < I.warmup * k()) return false;
      const o = openNow();
      if (opts.critical) {
        if (o.critical || o.n >= I.maxWithCritical) return false;
        // a critical one still respects a shorter gap, so two never land in the same minute
        return D.t - D.lastStart >= (I.gap * 0.5) * k();
      }
      if (o.n >= I.maxOpen) return false;
      if (D.t - D.lastStart < I.gap * k()) return false;
      if (D.t - D.lastResolved < I.calm * k()) return false;
      return true;
    }

    function started(kind, what) {
      D.lastStart = D.t;
      D.open = openNow().n;
      D.log.unshift({ t: D.t, kind, what: what || '' });
      if (D.log.length > 20) D.log.pop();
    }

    function update(dt) {
      D.t += dt;
      const n = openNow().n;
      // the last open problem was just solved: give the team a breather
      if (n < D.open && n === 0) D.lastResolved = D.t;
      D.open = n;
    }

    return {
      canStart, started, update,
      get busy() { return openNow().n > 0; },
      get time() { return D.t; },
      get log() { return D.log; },
      // seconds until a normal incident could start (for tests / UI)
      nextIn() {
        const g = k();
        return Math.max(0, I.warmup * g - D.t, I.gap * g - (D.t - D.lastStart), I.calm * g - (D.t - D.lastResolved));
      },
    };
  };
})();
