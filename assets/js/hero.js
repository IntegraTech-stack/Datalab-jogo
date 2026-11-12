/* DataLab — landing "video": jogo.html?hero runs the real game as a silent showcase (no login, menu or
   HUD) for the landing page's iframe. Loaded first so the other modules can see DL.HERO; the boot
   waits for DOMContentLoaded, which fires after every script on the page has run. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  DL.HERO = new URLSearchParams(location.search).has('hero');
  if (!DL.HERO) return;
  document.documentElement.classList.add('is-hero');

  addEventListener('DOMContentLoaded', () => {
    const D = window.DataLabDemo;
    if (!D) return;
    // the medium datacenter with its team already on shift, the camera drifting over it
    D.choosePreset('dcm');
    D.begin(false);
    D.setMode('explore');
    D.player.hidden = true;
    D.player.alpha = 0;
    const sc = D.scene, T = DL.T;
    sc.o.attract = false;
    const fit = () => { sc.o.padTop = 0; };
    fit();
    addEventListener('resize', fit);
    // a slow drift over the biggest room (the server hall), so the empty lot stays off screen
    const hall = sc.world.areas.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    // leaning towards the NOC side, and starting where the team is in view
    const cx = (hall.x + hall.w * 0.4) * T, cy = (hall.y + hall.h * 0.4) * T;
    const ax = (hall.w / 3) * T, ay = (hall.h / 6) * T;
    const t0 = 55;
    const update = sc.update.bind(sc);
    sc.update = function (dt) {
      update(dt);
      const t = sc.t + t0;
      sc.cam.x = cx + ax * Math.sin(t * 0.05);
      sc.cam.y = cy + ay * Math.sin(t * 0.07 + 0.6);
    };
    // warm up a little so the crew is already spread out on the first frame
    D.advance(20);

    // the landing page pauses the scene while it is off screen (and for reduced motion)
    addEventListener('message', (ev) => {
      if (ev.origin !== location.origin) return;
      if (ev.data === 'datalab:pause') D.scene.stop();
      else if (ev.data === 'datalab:play') D.scene.start(D.step);
    });
  });
})();
