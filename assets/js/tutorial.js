/* DataLab — first-run tutorial in short blocks:
   Construção (expand → room → rack → computer), Técnico (install → cable → terminal),
   Monitorar, Rede (a port of the player's switch goes err-disabled and is fixed in the switch CLI) and
   Infra (the "Criar VM" screen says what each server lacks → set Virtualização → create the first VM).
   Never blocks: steps advance by watching what the player did (counted from the start, so presets work too),
   the right control pulses, and the whole thing can be skipped or closed at any time. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;

  DL.createTutorial = function (game, sys) {
    const $ = (id) => document.getElementById(id);
    const el = { card: $('tutorial'), group: $('tutGroup'), step: $('tutStep'), title: $('tutTitle'), text: $('tutText'), act: $('tutDo'), bars: $('tutBars'), skip: $('tutSkip'), close: $('tutClose') };
    const world = () => game.scene.world;
    const B = () => sys.builder.state;
    const start = {};
    const U = { on: false, i: 0, done: false, acc: 0, guide: null, key: '' };

    const inBuild = () => game.mode() === 'build';
    const count = (kind) => world().items.filter((e) => e.kind === kind).length;
    const mine = () => sys.ops.devices().filter((d) => d.kind === 'server' && !d.pre);
    const toBuild = () => ({ act: 'Aperte <kbd>B</kbd> ou clique em <b>Construir</b>', guide: '[data-mode="build"]' });
    // the build dock can be folded away (Q): the steps that point inside it ask to open it first
    const toDock = () => ({ act: 'Mostre o catálogo de construção (<kbd>Q</kbd>)', guide: '.build__cats' });
    const toOps = () => ({ act: 'Abra <b>Celular → Tarefas</b> (botão no topo ou <kbd>T</kbd>)', guide: '#opsBtn' });
    const infra = () => sys.infra;
    // whatever covers the screen has to be closed before the next window is opened
    function closeFirst() {
      if (sys.terminal.isOpen) return { act: 'Feche o terminal (<kbd>Esc</kbd>)', guide: '#termClose' };
      if (sys.monitor.isOpen) return { act: 'Feche o monitoramento (<kbd>Esc</kbd>)', guide: '#monClose' };
      if (sys.cabling.isOpen) return { act: 'Feche o cabeamento (<kbd>Esc</kbd>)', guide: '#cabClose' };
      return null;
    }
    function toInfra() {
      if (infra().isOpen) return null;
      return closeFirst() || { act: 'Aperte <kbd>I</kbd> ou abra <b>Celular → Infra</b>', guide: '#infraBtn' };
    }

    // Rede: the port of the player's server goes err-disabled on purpose (the game is paused during the
    // tutorial, so nobody on the team fixes it first). A switch that can't do it (unmanaged) skips the step.
    function portFault() {
      const srv = mine().find((d) => d.state === 'online' && sys.ops.health(d).up);
      const t = srv && sys.ops.trace(srv);
      const sw = t && t.ok && !t.sw.fault ? sys.ops.injectFault(t.sw, 'port', { port: t.port }) : null;
      if (!sw) { U.port = { skip: true }; return; }
      sys.ops.report(sw, null);
      U.port = { sw: sw.key, srv: srv.name };
    }

    function pickItem(kind, label, where) {
      if (!inBuild()) return toBuild();
      if (B().closed) return toDock();
      // once per item: open the catalog already on it (if the player lets go of it, point at it instead)
      const auto = U.i + '|' + kind;
      if (U.auto !== auto && sys.builder.choose) { U.auto = auto; sys.builder.choose(kind); }
      if (B().tab !== 'equip') return { act: 'Abra a aba <b>Equipamentos</b>', guide: '[data-tab="equip"]' };
      if (!B().def || B().def.id !== kind) return { act: 'Escolha <b>' + label + '</b> no catálogo', guide: '[data-def="' + kind + '"]' };
      return { act: where, guide: null };
    }

    const STEPS = [
      {
        group: 'Construção', title: 'Expanda o terreno',
        text: 'Todo datacenter cresce. Abra espaço no terreno para construir. Cada expansão custa mais que a anterior, então confira o preço antes de confirmar.',
        done: () => world().lot.w * world().lot.h > start.lot,
        how() {
          if (!inBuild()) return toBuild();
          if (B().closed) return toDock();
          if (B().tab !== 'room') return { act: 'Abra a aba <b>Espaços</b>', guide: '[data-tab="room"]' };
          if (B().lotAsk) return { act: 'Confira o preço e clique em <b>Confirmar</b>', guide: '[data-room="lot-ok"]' };
          if (B().roomTool !== 'select') return { act: 'Escolha a ferramenta <b>Selecionar</b>', guide: '[data-room-tool="select"]' };
          if (!B().roomMore) return { act: 'Clique em <b>Mais</b> para ver o <b>Terreno</b>', guide: '[data-room-more]' };
          return { act: 'Clique em <b>+</b> na <b>Largura</b> do <b>Terreno</b>', guide: '[data-room="lw+"]' };
        },
      },
      {
        group: 'Construção', title: 'Crie uma sala',
        text: 'Desenhe uma sala no terreno novo. Paredes e porta aparecem sozinhas.',
        done: () => world().rooms.length > start.rooms,
        how() {
          if (!inBuild()) return toBuild();
          if (B().closed) return toDock();
          if (B().tab !== 'room') return { act: 'Abra a aba <b>Espaços</b>', guide: '[data-tab="room"]' };
          if (B().roomTool !== 'draw') return { act: 'Escolha a ferramenta <b>Nova sala</b>', guide: '[data-room-tool="draw"]' };
          return { act: 'Arraste no terreno vazio (a área verde), encostado numa sala', guide: null, area: true };
        },
      },
      {
        group: 'Construção', title: 'Coloque um rack',
        text: 'Racks guardam servidores e switches — o coração do datacenter. Tudo sai do caixa da empresa: no começo só os itens básicos estão liberados, o resto abre conforme você sobe de nível.',
        done: () => count('rack') > start.racks,
        how: () => pickItem('rack', 'Rack', 'Clique dentro da sala nova para posicionar'),
      },
      {
        group: 'Construção', title: 'Coloque um computador',
        text: 'É na estação de trabalho que a equipe senta, trabalha e monitora tudo.',
        done: () => count('desk') > start.desks,
        how: () => pickItem('desk', 'Computador', 'Clique para posicionar · <kbd>R</kbd> gira'),
      },
      {
        group: 'Técnico', title: 'Instale um servidor',
        text: 'Servidor vai dentro do rack e precisa de um switch por perto. Com o primeiro servidor a empresa começa a operar: cada servidor no ar gera receita. Dinheiro só sai quando você compra algo ou contrata.',
        done: () => mine().some((d) => sys.ops.switchesNear(d).length),
        how() {
          const has = mine().length;
          if (!has) return pickItem('server', 'Servidor intermediário', 'Clique no rack para instalar o servidor');
          return pickItem('switch', 'Switch gerenciável 24p', 'Agora instale um switch no mesmo rack (ou na mesma sala)');
        },
      },
      {
        group: 'Técnico', title: 'Ligue o cabo',
        text: 'O cabo leva a rede do switch até o servidor. Sem cabo certo, sem rede.',
        done: () => mine().some((d) => d.state !== 'new'),
        how() {
          if (sys.cabling.isOpen) return { act: 'Clique na porta <b>eth0</b> do servidor (anel pulsando) e depois numa porta <b>gi0/…</b> do switch', guide: null };
          if (game.opsOpen()) return { act: 'Clique em <b>Ligar cabos</b> no servidor novo', guide: '[data-op="cable"]' };
          return toOps();
        },
      },
      {
        group: 'Técnico', title: 'Configure no terminal',
        text: 'Ligue a interface, dê um IP, crie a rota e teste com ping. Você digita os comandos.',
        done: () => mine().some((d) => d.state === 'online'),
        how() {
          if (sys.cabling.isOpen) return { act: 'Feche o cabeamento (<kbd>Esc</kbd>) e abra o terminal pelo painel Tarefas', guide: '#cabClose' };
          if (sys.terminal.isOpen) return { act: 'Siga os passos à direita do terminal · travou? <b>Precisa de ajuda?</b>', guide: null };
          if (game.opsOpen()) return { act: 'Clique em <b>Abrir terminal</b>', guide: '[data-op="term"]' };
          return toOps();
        },
      },
      {
        group: 'Monitorar', title: 'Veja no monitoramento',
        text: 'Servidor configurado entra no monitor: CPU, memória, disco, rede e disponibilidade em tempo real.',
        done: () => sys.monitor.opened > start.mon && mine().some((d) => d.state === 'online'),
        how() {
          if (sys.terminal.isOpen) return { act: 'Feche o terminal (<kbd>Esc</kbd>)', guide: '#termClose' };
          return { act: 'Aperte <kbd>M</kbd> ou abra <b>Celular → Monitor</b>', guide: '#monBtn' };
        },
      },
      {
        group: 'Rede', title: 'Reative a porta do switch',
        text: 'Problemas acontecem: a porta do switch onde o seu servidor está ligado entrou em err-disabled e derrubou o servidor. No terminal do switch, ache a porta com show interfaces status e reinicie-a (shutdown, depois no shutdown).',
        enter: portFault,
        done() {
          if (!U.port) return false;
          if (U.port.skip) return true;
          const sw = sys.ops.get(U.port.sw);
          return !sw || !sw.fault || sw.fault.type !== 'port';
        },
        how() {
          const sw = U.port && sys.ops.get(U.port.sw);
          if (!sw) return { act: '', guide: null };
          if (sys.terminal.isOpen && sys.terminal.device === sw) return { act: 'Siga os passos à direita do terminal · a tabela do <b>show interfaces status</b> mostra a porta em vermelho', guide: null };
          if (sys.terminal.isOpen) return { act: 'Esse é o terminal de outro equipamento: feche (<kbd>Esc</kbd>) e abra o do <b>' + sw.name + '</b>', guide: '#termClose' };
          const c = closeFirst();
          if (c) return c;
          if (infra().isOpen) return { act: 'Feche a janela Infra (<kbd>Esc</kbd>)', guide: '#infra [data-px="close"]' };
          if (game.opsOpen()) return { act: 'No alerta do <b>' + sw.name + '</b>, clique em <b>Abrir terminal</b>', guide: '[data-op="term"][data-dev="' + sw.key + '"]' };
          return toOps();
        },
      },
      {
        group: 'Infra', title: 'Veja o que falta para criar VMs',
        text: 'Um servidor pode virar nó de virtualização e hospedar várias máquinas virtuais (VMs). A tela Criar VM diz, servidor por servidor, o que falta.',
        done: () => infra().createViews > start.vmViews || infra().readyNodes().length > 0,
        how() {
          const o = toInfra();
          if (o) return o;
          return { act: 'Abra a aba <b>Criar VM</b>', guide: '#infra .px__tabs [data-px="create"]' };
        },
      },
      {
        group: 'Infra', title: 'Transforme o servidor em nó',
        text: 'Um nó precisa estar online e ter a função Virtualização. Clique no seu servidor na lista: a aba Servidores abre com ele destacado.',
        done: () => infra().readyNodes().length > 0,
        how() {
          const o = toInfra();
          if (o) return o;
          const srv = mine().find((d) => d.state === 'online') || mine()[0];
          if (infra().view === 'servers') return { act: 'Na coluna <b>Especialização</b>' + (srv ? ' do ' + srv.name : '') + ', escolha <b>Virtualização</b>', guide: srv ? '[data-svc="' + srv.key + '"]' : null };
          if (infra().view === 'create') return { act: 'Clique no servidor da lista: o texto diz o que falta', guide: srv ? '[data-px="goto"][data-key="' + srv.key + '"]' : '[data-px="goto"]' };
          return { act: 'Abra a aba <b>Criar VM</b>', guide: '#infra .px__tabs [data-px="create"]' };
        },
      },
      {
        group: 'Infra', title: 'Crie a primeira VM',
        text: 'Escolha nome, serviço, vCPU, RAM e disco. A VM roda um serviço e rende pelo que usa: o nó divide o hardware entre as VMs.',
        done: () => infra().vms.length > start.vms,
        how() {
          const o = toInfra();
          if (o) return o;
          if (infra().view !== 'create') return { act: 'Abra a aba <b>Criar VM</b>', guide: '#infra .px__tabs [data-px="create"]' };
          return { act: 'Confira os recursos livres e clique em <b>Criar VM</b>', guide: '#pxForm [type="submit"]' };
        },
      },
    ];

    // the tip shown when the tutorial is over (only there: the tutorial runs once per new game)
    const tip = document.createElement('p');
    tip.className = 'tutorial__tip';
    tip.hidden = true;
    tip.innerHTML = '<b>Dica</b> Saia pela porta (<kbd>E</kbd>): ao lado do DataLab tem duas lojinhas! Fale com quem está no balcão (<kbd>E</kbd>) para abrir a <b>Loja</b>.';
    el.act.after(tip);
    el.bars.innerHTML = STEPS.map((s, i) => '<i' + (i && STEPS[i - 1].group !== s.group ? ' class="gap"' : '') + '></i>').join('');
    const bars = Array.from(el.bars.children);

    function setGuide(sel) {
      const node = sel ? document.querySelector(sel) : null;
      if (node === U.guide) return;
      if (U.guide) U.guide.classList.remove('is-guide');
      U.guide = node;
      if (node) node.classList.add('is-guide');
      // on a phone the control may sit further down a scrolling panel: bring it into view (mobile.js)
      if (node && DL.mobileReveal) DL.mobileReveal(node);
    }

    // Spotlight: the screen goes green and translucent (the game still shows through) with a hole over the
    // control to click and another over the tutorial card. It never takes clicks, so it can't block play.
    const spot = document.createElement('div');
    spot.className = 'tut-spot';
    spot.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('div');
    ring.className = 'tut-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(spot, ring);

    const hole = (r, pad, rad) => {
      const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      const k = Math.min(rad, w / 2, h / 2);
      return 'M' + (x + k) + ' ' + y + 'H' + (x + w - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (x + w) + ' ' + (y + k) +
        'V' + (y + h - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (x + w - k) + ' ' + (y + h) +
        'H' + (x + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + x + ' ' + (y + h - k) +
        'V' + (y + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (x + k) + ' ' + y + 'Z';
    };
    const shown = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;

    // the part of the control actually on screen: scrolling panels clip it (else the hole shows empty panel)
    function visibleRect(node) {
      const b = node.getBoundingClientRect();
      let l = b.left, t = b.top, rr = b.right, bb = b.bottom;
      for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = p.getBoundingClientRect();
        l = Math.max(l, c.left); t = Math.max(t, c.top); rr = Math.min(rr, c.right); bb = Math.min(bb, c.bottom);
      }
      return { left: l, top: t, right: rr, bottom: bb, width: Math.max(0, rr - l), height: Math.max(0, bb - t) };
    }

    let lastSpot = null;
    function drawSpot() {
      let node = U.on && !U.done && U.guide && U.guide.isConnected ? U.guide : null;
      // a top bar button inside a closed group: point at the group's button until it opens
      // (on a phone the groups live in the Menu drawer: mobile.js points at the Menu button while it is closed)
      const group = node && !DL.mobileGuide && node.closest('.hud-group:not(.is-open)');
      if (group) node = group.querySelector('.hud-group__btn');
      if (node && DL.mobileGuide) node = DL.mobileGuide(node);
      const r = node && visibleRect(node);
      if (!r || !shown(r)) { if (lastSpot) { lastSpot = ''; spot.classList.remove('is-on'); ring.classList.remove('is-on'); } return; }
      let d = 'M0 0H' + innerWidth + 'V' + innerHeight + 'H0Z' + hole(r, 6, 8);
      const c = el.card.hidden ? null : el.card.getBoundingClientRect();
      if (c && shown(c)) d += hole(c, 0, 4);
      // runs every frame: touch the DOM only when the spot moved (each write repaints the full-screen mask)
      const k = d + '|' + r.left + ',' + r.top + ',' + r.width + ',' + r.height;
      if (k === lastSpot) return;
      lastSpot = k;
      spot.style.clipPath = "path(evenodd, '" + d + "')";
      ring.style.transform = 'translate(' + (r.left - 6) + 'px,' + (r.top - 6) + 'px)';
      ring.style.width = r.width + 12 + 'px';
      ring.style.height = r.height + 12 + 'px';
      spot.classList.add('is-on');
      ring.classList.add('is-on');
    }
    (function loop() { drawSpot(); requestAnimationFrame(loop); })();

    function render(force) {
      const s = STEPS[U.i], h = s.how();
      U.area = !!h.area;
      const key = U.i + '|' + h.act;
      if (force || key !== U.key) {
        U.key = key;
        el.group.textContent = 'Tutorial · ' + s.group;
        el.step.textContent = U.i + 1 + ' / ' + STEPS.length;
        el.title.textContent = s.title;
        el.text.textContent = s.text;
        el.act.innerHTML = DL.mobileText ? DL.mobileText(h.act) : h.act; // touch words on a phone (mobile.js)
        if (force) {
          for (const n of [el.title, el.text]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
        }
        bars.forEach((b, i) => { b.classList.toggle('is-done', i < U.i); b.classList.toggle('is-current', i === U.i); });
      }
      setGuide(h.guide);
    }

    function begin() {
      start.lot = world().lot.w * world().lot.h;
      start.rooms = world().rooms.length;
      start.racks = count('rack');
      start.desks = count('desk');
      start.mon = sys.monitor.opened;
      start.vmViews = infra() ? infra().createViews : 0;
      start.vms = infra() ? infra().vms.length : 0;
      U.port = null;
      U.on = true;
      U.done = false;
      U.i = 0;
      el.card.hidden = false;
      el.card.classList.remove('is-done');
      tip.hidden = true;
      el.skip.hidden = false;
      el.close.hidden = true;
      render(true);
    }

    function finish() {
      setGuide(null);
      U.done = true;
      el.card.classList.add('is-done');
      el.group.textContent = 'Tutorial';
      el.step.textContent = 'Concluído';
      el.title.textContent = 'Esse é o seu datacenter.';
      el.text.textContent = 'Agora a empresa está operando: servidores no ar geram receita, e o caixa só diminui quando você compra algo ou contrata. Acompanhe o card de finanças e resolva os problemas rápido — equipamento com problema não gera receita.';
      el.act.innerHTML = DL.MOBILE ? 'Toque em <b>Construir</b> e <b>Equipe</b> no topo · Tarefas, Monitor e Infra ficam no <b>Celular</b>'
        : '<kbd>B</kbd> construir · <kbd>C</kbd> equipe · <kbd>M</kbd> monitor · <kbd>T</kbd> tarefas · <kbd>I</kbd> infra';
      bars.forEach((b) => { b.classList.add('is-done'); b.classList.remove('is-current'); });
      el.skip.hidden = true;
      el.close.hidden = false;
      // the last tip: the two shops next to the datacenter (street.js points at them, lojas.js)
      tip.hidden = false;
      if (DL.Street && DL.Street.highlightShops) DL.Street.highlightShops(12);
      game.toast('ok', 'Tutorial concluído', 'O datacenter é seu');
      setTimeout(() => { if (U.on && U.done) stop(); }, 25000);
    }

    function stop() {
      U.on = false;
      setGuide(null);
      el.card.hidden = true;
    }

    el.skip.addEventListener('click', () => { stop(); el.skip.blur(); });
    el.close.addEventListener('click', () => { stop(); el.close.blur(); });

    function update(dt) {
      if (!U.on || U.done) return;
      U.acc += dt;
      if (U.acc < 0.15) return;
      U.acc = 0;
      let moved = false;
      while (U.i < STEPS.length && STEPS[U.i].done()) { U.i++; moved = true; }
      if (U.i >= STEPS.length) { finish(); return; }
      // a step may set the scene when it starts (the Rede step breaks a switch port)
      if (moved && STEPS[U.i].enter) STEPS[U.i].enter();
      if (moved) game.sfx('step');
      render(moved);
    }

    // Suggest where the new room goes: the free ground right of every room.
    function overlay(g, sc) {
      if (!U.on || U.done || !U.area) return;
      const w = world(), lot = w.lot;
      let x = 1;
      const areas = w.areas || w.rooms;
      for (const r of areas) x = Math.max(x, r.x + r.w + 1);
      const wd = lot.w - x - 1, y = 2, hh = Math.min(lot.h - 3, areas[0].h);
      if (wd < 3 || hh < 3) return;
      const a = 0.35 + 0.25 * Math.sin(sc.t * 4);
      g.fillStyle = 'rgba(126,224,161,' + (a * 0.25).toFixed(3) + ')';
      g.fillRect(x * T, y * T, wd * T, hh * T);
      g.fillStyle = 'rgba(126,224,161,' + a.toFixed(3) + ')';
      for (let px = x * T; px < (x + wd) * T; px += 4) { g.fillRect(px, y * T, 2, 1); g.fillRect(px, (y + hh) * T - 1, 2, 1); }
      for (let py = y * T; py < (y + hh) * T; py += 4) { g.fillRect(x * T, py, 1, 2); g.fillRect((x + wd) * T - 1, py, 1, 2); }
    }

    return {
      begin, stop, update, overlay,
      get active() { return U.on && !U.done; },
      get step() { return U.i; },
      get total() { return STEPS.length; },
    };
  };
})();
