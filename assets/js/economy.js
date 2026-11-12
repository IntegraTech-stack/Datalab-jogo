/* DataLab — economy: the company's money ($: infrastructure, land, salaries, operation) kept apart
   from the player's own balances (Créditos earned by playing; Gold, the golden premium coin that buys
   skins, special items and legendary bots — never company spending), the company's cash flow (revenue from healthy servers, problems no longer cost money: a broken server simply stops earning), the
   "datacenter concluído" checklist and progress milestones that hand out rewards.
   Time: one real second is one game minute (the HUD clock), so every "/min" rate below is per
   game minute. All numbers live in DL.ECON so they are easy to tune. */
(function () {
  'use strict';
  const DL = window.DL;

  DL.ECON = {
    // Two phases. Setup: a small budget to learn building — nothing costs money over time (there is
    // no free starter kit: the tutorial's first rack, computer, server and switch are paid too).
    // Live (from the first server installed): salaries, energy, rent, internet and maintenance start,
    // ramping up over `opexRamp` minutes; servers earn by type. Problems NEVER take money away: they
    // raise alerts and a broken server simply stops earning until it is fixed (and a quick fix pays
    // the client's SLA bonus).
    // Balance target (Iniciante pays 70%): an intermediate server nets ~10 $/min (~15 000 a month), about
    // two salaries, and takes ~10 game hours to pay for itself. Growth comes slowly and needs
    // planning: hiring and buying ahead of revenue sinks the cash.
    // No running costs: the company only spends money when the player buys something (equipment,
    // furniture, land, a hire). Salaries, energy, rent, link, maintenance, traffic, licences and on-call
    // fees are not charged, so there is no loss — only slower or faster gains. (The cost rates below stay
    // as reference; set true to bring them back.)
    runningCosts: false,
    startCash: 15000,           // company balance at the start of a fresh game ($)
    presetCash: { office: 45000, noc: 70000, dcs: 110000, dcm: 180000 }, // ready-made environments start live
    // nothing comes free: every rack, computer, server, hire and land expansion is paid from the start
    starterKit: {},
    // Land: the starting lot is free; each expansion is paid per new m², dearer the bigger the lot
    // already is and the more floor is built on it (see DL.lotPrice). Shrinking gives nothing back.
    lot: { base: 18, freeArea: 90, growth: 1.05, builtK: 600 },
    opexRamp: 120,              // minutes for operating costs to reach their full rate (30% → 100%)
    opexFloor: 0.3,
    rentPerTile: 0.02,          // $/min per tile of built floor
    linkCost: 3,                // $/min: the internet link, once a switch is installed
    maintPerDevice: 1.2,        // $/min per installed server / switch / storage (support contracts)
    trafficPerServer: 4,        // $/min per online server: bandwidth + software licences
    marketScale: 60,            // demand saturates: revenue × 1 / (1 + servers / marketScale)
    serverSetupFee: 400,        // licences + configuration, paid when a server goes online
    firstContract: 2000,        // the first client signs when the first server goes online
    loanAmount: 20000,          // emergency loan when the cash runs dry (live phase)
    loanFee: 0.1,               // repaid with 10% on top…
    loanRepay: 0.2,             // …taking 20% of each minute's profit (at least loanMinRepay $/min)
    loanMinRepay: 2,
    revenuePerServer: 24,       // $/min for each online server that answers (before market saturation)
    // a problem fixed within slaWindow minutes pays the client's SLA bonus (less the slower the fix)
    slaBonus: 150, slaWindow: 30,
    // Client contracts: one-off payments when the datacenter reaches a goal (kept in the save).
    // up: healthy servers online · svc: specialisations online and healthy · vms: running VMs
    contracts: [
      { id: 'up3', name: 'Loja virtual', goal: '3 servidores no ar', need: { up: 3 }, cash: 2500 },
      { id: 'web', name: 'Hospedagem de sites', goal: 'servidor Web + DNS no ar', need: { svc: ['web', 'dns'] }, cash: 3000 },
      { id: 'up5', name: 'Rede de clínicas', goal: '5 servidores no ar', need: { up: 5 }, cash: 4000 },
      { id: 'db', name: 'Sistema de gestão (ERP)', goal: 'Banco de dados no ar', need: { svc: ['db'] }, cash: 3500 },
      { id: 'win', name: 'Rede corporativa', goal: 'Windows Server com domínio (AD)', need: { svc: ['win'], domain: true }, cash: 3500 },
      { id: 'up8', name: 'Startup de aplicativos', goal: '8 servidores no ar', need: { up: 8 }, cash: 6000 },
      { id: 'vm3', name: 'Nuvem privada', goal: '3 VMs rodando', need: { vms: 3 }, cash: 5000 },
      { id: 'up12', name: 'Varejista nacional', goal: '12 servidores no ar', need: { up: 12 }, cash: 9000 },
      { id: 'up20', name: 'Banco digital', goal: '20 servidores no ar', need: { up: 20 }, cash: 15000 },
    ],
    // Payroll: every member has an individual monthly salary (role base × level × a personal factor
    // negotiated at hiring), paid once a month. One day on the HUD clock (24 game hours = 24 real
    // minutes) is one month of the company's operation, so pay day is at 00:00.
    monthMinutes: 1440,
    salary: { funcionario: 4000, atendente: 3600, seguranca: 4400, tecnico: 5200, redes: 6000, servidores: 6000, sysadmin: 6800, gerente: 8800 },
    salaryCustom: 4800,         // roles created by the player
    salaryPerLevel: 0.06,       // +6% per level above 1
    hireFee: 0.5,               // hiring costs half a monthly salary (recruitment + onboarding)
    onCallFee: 250,             // each time an on-call member is called in to cover a shift
    // hardware (hardware.js): a server rends revenuePerServer × its model's perf × how well its network
    // keeps up; storage rents its usable capacity; equipment pays for the power it draws
    storagePerTB: 0.15,         // $/min per usable TB (× the array's speed)
    wifiPerAp: 2,               // $/min for each powered access point (guest Wi-Fi)
    energyPerKw: 2,           // $/min per kW drawn by the equipment
    credits: {
      taskOrder: 6, taskAuto: 2,          // a crew task finished (ordered by you / routine)
      serverSetup: 50,                    // a server you configured goes online
      incident: 30, incidentFast: 40,     // incident resolved (+ bonus when quick)
      fastWindow: 20, slowWindow: 180,    // minutes: full bonus until fastWindow, none after slowWindow
      crewFix: 0.5,                       // the crew fixed it: share of the reward
      uptimePerServer: 1, uptimeEvery: 60, // every hour, per healthy server
      datacenter: 200,                    // a datacenter completed
    },
    // Progress milestones. `every` repeats (20, 40, 60…); add new counters / rewards here later.
    milestones: [
      { id: 'dc20', counter: 'datacenters', every: 20, title: 'Marco de datacenters', label: (n) => n + ' datacenters concluídos', reward: { gold: 100 } },
    ],
    // Gold: earned by playing (each datacenter completed), exchanged from Créditos, or in packs
    gold: { welcome: 100, datacenter: 20, rate: 10 }, // rate: créditos per 1 Gold
    // Gold packs: paid with AbacatePay when logged in (price and coins come from public.gold_packs on
    // the server; keep these in sync for display). Buying needs an account (Pix, payment-service.js).
    store: [
      { sku: 'gold_100', coins: 100, price: 'R$ 5,80' },
      { sku: 'gold_500', coins: 500, price: 'R$ 10,80' },
      { sku: 'gold_1000', coins: 1000, price: 'R$ 20,80', tag: 'Popular' },
      { sku: 'gold_1500', coins: 1500, price: 'R$ 30,80' },
      { sku: 'gold_5000', coins: 5000, price: 'R$ 50,80', tag: 'Melhor valor' },
    ],
  };

  // Price of growing the lot from `lot` by dw × dh with `built` m² of floor on it ($, rounded to 50).
  DL.lotPrice = function (lot, dw, dh, built) {
    const L = DL.ECON.lot, area = lot.w * lot.h;
    const added = (lot.w + Math.max(0, dw)) * (lot.h + Math.max(0, dh)) - area;
    if (added <= 0) return 0;
    const perTile = L.base * Math.pow(Math.max(1, area / L.freeArea), L.growth) * (1 + (built || 0) / L.builtK);
    return Math.round((added * perTile) / 50) * 50;
  };

  const WALLET_KEY = 'datalab.wallet.v1';
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const money = (n) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  DL.money = money;

  // Monthly salary of a role at a level (pay: the member's personal factor, 0.92–1.08)
  DL.salaryFor = function (role, level, pay) {
    const E = DL.ECON, base = E.salary[role] != null ? E.salary[role] : E.salaryCustom;
    return Math.round((base * (1 + E.salaryPerLevel * Math.max(0, (level || 1) - 1)) * (pay || 1)) / 50) * 50;
  };
  DL.salaryOf = (a) => DL.salaryFor(a.crew.profile.role, a.crew.stats.level, a.crew.pay);
  DL.hireCostFor = (role, level, pay) => Math.round((DL.salaryFor(role, level, pay) * DL.ECON.hireFee) / 50) * 50;

  DL.createEconomy = function (game, sys) {
    const E = DL.ECON, scene = game.scene, ops = sys.ops;
    const world = () => scene.world;
    const $ = (id) => document.getElementById(id);
    const el = {
      btn: $('econBtn'), cash: $('econCash'), flow: $('econFlow'), credits: $('econCredits'), coins: $('econCoins'),
      wallet: $('wallet'), walletBody: $('walletBody'), reward: $('reward'), rewardBody: $('rewardBody'), tags: $('lossTags'), float: $('econFloat'),
      pay: $('econPay'),
    };

    /* ---------- wallet (persists in this browser) ---------- */
    const W = { credits: 0, gold: 0, counters: { datacenters: 0, incidents: 0 }, ledger: [] };
    try { Object.assign(W, JSON.parse(localStorage.getItem(WALLET_KEY) || '{}')); } catch (e) { /* fresh wallet */ }
    W.counters = Object.assign({ datacenters: 0, incidents: 0 }, W.counters);
    // Cloud mode (logged in, services/*.js): balances come from the server and are never written to
    // this browser's storage; what the session earns is reported in the next save (CLAIM) and the
    // server decides how much of it counts.
    const CLOUD = { on: false, local: null };
    const CLAIM = { revenue: 0, opex: 0, credits: 0, incidents: [], problems: [], dc_done: false, since: 0 };
    // sent (after a save): how many solved problems went in it — the ones after those (they did not fit, or were
    // solved while the save was on its way) stay for the next save
    function resetClaim(sent) { CLAIM.revenue = 0; CLAIM.opex = 0; CLAIM.credits = 0; CLAIM.incidents = []; CLAIM.problems = typeof sent === 'number' ? CLAIM.problems.slice(sent) : []; CLAIM.dc_done = false; CLAIM.since = game.time ? game.time() : 0; }
    const save = () => { if (CLOUD.on) return; try { localStorage.setItem(WALLET_KEY, JSON.stringify(W)); } catch (e) { /* private mode */ } };
    // DataCoins became Gold (the same premium coin): carry the old balance over once, plus the welcome gift
    if (!W.goldSince) {
      W.gold = Math.max(0, (W.gold || 0) + (W.datacoins || 0) + E.gold.welcome);
      delete W.datacoins;
      for (const l of W.ledger) if (l.cur === 'datacoins') l.cur = 'gold';
      W.goldSince = Date.now();
      W.ledger.unshift({ cur: 'gold', amount: E.gold.welcome, why: 'Boas-vindas · moeda dourada', t: '--:--' });
      save();
    }
    const CUR = { credits: 'créditos', gold: 'Gold' };
    const curOf = (c) => (c === 'datacoins' ? 'gold' : c);

    /* ---------- company ---------- */
    const CO = { cash: E.startCash, revenue: 0, payroll: 0, earned: 0, problems: [], hourAcc: 0, acc: 0, dcChecked: 0,
      servers: 0, storage: 0, wifi: 0, energy: 0, kw: 0, spent: 0, sold: 0, rateAt: -1, poe: null, slow: [],
      // payroll: monthly total, last pay day (game minutes since the session started), history
      payrollMonth: 0, lastPay: 0, month: 1, paid: [], hired: 0,
      // phase ('setup' → 'live'), starter kit left, operating costs per minute, this month's books, loan
      phase: 'setup', liveAt: 0, kit: Object.assign({}, E.starterKit), rent: 0, link: 0, maint: 0, opexK: 0, net: 0,
      mo: null, months: [], debt: 0, loans: 0, contracts: [] };
    const freshMonth = () => ({ revenue: 0, sales: 0, contracts: 0, salaries: 0, energy: 0, rent: 0, link: 0, maint: 0, traffic: 0, setup: 0, oncall: 0, purchases: 0, hires: 0 });
    const monthIncome = (m) => m.revenue + m.sales + (m.contracts || 0);
    const monthCosts = (m) => m.salaries + m.energy + m.rent + m.link + m.maint + m.traffic + m.setup + (m.oncall || 0);
    CO.mo = freshMonth();
    const queue = []; // reward screens waiting to be shown

    // the learning mode pays more (Experiente) or less (Iniciante) — difficulty.js
    const rewardK = () => (DL.learn ? DL.learn().reward : 1);

    function earn(cur, amount, why, opts) {
      cur = curOf(cur);
      if (amount > 0 && cur === 'credits' && !(opts && opts.raw)) amount *= rewardK();
      amount = Math.round(amount);
      if (!amount) return;
      if (CLOUD.on && !(opts && opts.server)) {
        // the server grants Gold (datacenter, purchases…) — local Gold changes don't exist in cloud mode
        if (cur === 'gold') return;
        if (cur === 'credits' && amount > 0) CLAIM.credits += amount;
      }
      W[cur] = (W[cur] || 0) + amount;
      W.ledger.unshift({ cur, amount, why, t: game.clock() });
      if (W.ledger.length > 30) W.ledger.pop();
      save();
      render();
      game.emit('wallet', { cur, amount });
      if (!(opts && opts.quiet)) floater((amount > 0 ? '+' : '') + fmt(amount) + ' ' + CUR[cur], cur);
    }
    // Pay from the player's balances (never from the company). Returns null when paid, or the reason.
    function spend(cur, amount, why) {
      cur = curOf(cur);
      amount = Math.round(amount);
      if (amount <= 0) return null;
      if ((W[cur] || 0) < amount) return 'Saldo insuficiente: faltam ' + fmt(amount - (W[cur] || 0)) + ' ' + CUR[cur];
      earn(cur, -amount, why, { quiet: true });
      return null;
    }
    // Créditos → Gold at the fixed rate (whole Gold only)
    function exchange(credits) {
      const gold = Math.floor(credits / E.gold.rate);
      if (gold < 1) return 'Mínimo de ' + E.gold.rate + ' créditos';
      const cost = gold * E.gold.rate;
      if (W.credits < cost) return 'Créditos insuficientes';
      earn('credits', -cost, 'Câmbio → ' + gold + ' Gold', { quiet: true, raw: true });
      earn('gold', gold, 'Câmbio de ' + fmt(cost) + ' créditos');
      return null;
    }

    function grant(reward, why) {
      if (reward.credits) earn('credits', reward.credits, why);
      if (reward.gold || reward.datacoins) earn('gold', reward.gold || reward.datacoins, why);
    }

    // count progress; milestones with `every` fire on each multiple
    function count(counter, by) {
      W.counters[counter] = (W.counters[counter] || 0) + (by || 1);
      const n = W.counters[counter];
      for (const m of E.milestones) {
        if (m.counter !== counter || !m.every || n % m.every) continue;
        grant(m.reward, m.label(n));
        queue.push({ m, n });
      }
      save();
      if (queue.length && !el.reward.classList.contains('is-open')) showReward();
    }

    /* ---------- open problems (tracked for the UI; they cost nothing) ---------- */
    const KIND = { link: 'offline', cable: 'offline', port: 'port', service: 'service', disk: 'disk', winsvc: 'winsvc', lockout: 'lockout' };
    const LABEL = { offline: 'Servidor offline', port: 'Porta do switch em erro', service: 'Serviço web parado', disk: 'Disco cheio', winsvc: 'Serviço do Windows parado', lockout: 'Conta bloqueada no AD' };

    function problems() {
      const out = [];
      for (const d of ops.devices()) {
        if (d.kind === 'patch') continue;
        // (the faults only problems set up say how they count: ops.js FAULTS[type].loss)
        let kind = d.fault ? KIND[d.fault.type] || (DL.FAULTS[d.fault.type] && DL.FAULTS[d.fault.type].loss) || null : null;
        if (!kind && d.kind === 'server' && d.state === 'online' && !ops.health(d).up) kind = 'offline';
        if (!kind) { d.loss = null; continue; }
        if (!d.loss || d.loss.kind !== kind) d.loss = { kind, since: scene.t, label: LABEL[kind] };
        out.push(d);
      }
      return out;
    }
    const lossOf = (d) => d.loss || null;

    function healthyServers() {
      return ops.devices().filter((d) => d.kind === 'server' && d.state === 'online' && !d.fault && ops.health(d).up).length;
    }

    // What the hardware earns and costs per minute; recomputed a few times a second, not every frame.
    function rates() {
      if (CO.rateAt >= 0 && scene.t - CO.rateAt < 0.5) return;
      CO.rateAt = scene.t;
      let srv = 0, up = 0;
      const slow = [];
      for (const d of ops.devices()) {
        if (d.kind !== 'server' || d.state !== 'online' || d.fault || !ops.health(d).up) continue;
        up++;
        const m = DL.hwOf(d), net = ops.netOf(d);
        // the server's specialisation (infra.js) earns more or less, depending on whether its needs are met
        srv += E.revenuePerServer * m.perf * net.factor * (DL.svcFactor ? DL.svcFactor(d) : 1);
        if (net.why && net.factor < 0.9) slow.push({ d, why: net.why, pct: Math.round(net.factor * 100) });
      }
      // virtual machines hosting services on the virtualization nodes
      if (DL.vmRevenue) srv += DL.vmRevenue();
      let sto = 0, kw = 0;
      for (const e of world().items) {
        if (e.kind === 'storage') {
          const m = DL.hwModel('storage', e.model);
          sto += m.usable * E.storagePerTB * (0.7 + 0.3 * m.iops);
        }
        if (e.tel && e.tel.power) kw += e.tel.unit === 'W' ? e.tel.power / 1000 : e.tel.power;
      }
      const poe = ops.poeStatus();
      CO.poe = poe;
      // more servers, more customers to find: each extra one earns a little less (still worth it)
      CO.demand = 1 / (1 + up / E.marketScale);
      CO.upCount = up;
      CO.servers = srv * CO.demand;
      CO.storage = sto;
      // the racks without power after a blackout (blackout.js): the servers and the storage earn nothing
      if (DL.racksSemEnergia) { CO.servers = 0; CO.storage = 0; }
      CO.wifi = poe.ap * E.wifiPerAp;
      CO.kw = kw;
      // infrastructure: rent of the built floor, the internet link, support contracts — ramping in
      const w = world();
      let tiles = 0;
      for (let i = 0; i < w.tiles.length; i++) { const t = w.tiles[i]; if (t === '.' || t === ',' || t === '_') tiles++; }
      const devs = ops.devices().filter((d) => d.kind !== 'patch');
      const live = CO.phase === 'live';
      CO.opexK = live ? Math.min(1, E.opexFloor + (1 - E.opexFloor) * Math.max(0, nowMin() - CO.liveAt) / E.opexRamp) : 0;
      CO.tiles = tiles;
      CO.devCount = devs.length + w.items.filter((e) => e.kind === 'storage').length;
      CO.energy = kw * E.energyPerKw * CO.opexK;
      CO.rent = tiles * E.rentPerTile * CO.opexK;
      CO.link = devs.some((d) => d.kind === 'switch') ? E.linkCost * CO.opexK : 0;
      CO.maint = CO.devCount * E.maintPerDevice * CO.opexK;
      CO.traffic = up * E.trafficPerServer * CO.opexK;
      CO.slow = slow;
    }

    /* ---------- payroll: individual salaries, paid monthly ---------- */
    const nowMin = () => (game.time ? game.time() : scene.t);           // game minutes since the session started
    const startMin = () => (game.clockStart != null ? game.clockStart : 480); // the clock starts at 08:00
    // next pay day: the next 00:00 on the clock
    function nextPayAt() {
      const abs = startMin() + nowMin();
      return (Math.floor(abs / E.monthMinutes) + 1) * E.monthMinutes - startMin();
    }
    function nextPayAtCached() { if (CO.payAt == null) CO.payAt = nextPayAt(); return CO.payAt; }
    const payIn = () => Math.max(0, nextPayAtCached() - nowMin());
    const fmtIn = (m) => { m = Math.ceil(m); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'; };
    const members = () => (sys.crew ? sys.crew.members : []);
    function payrollMonth() { return members().reduce((s, a) => s + DL.salaryOf(a), 0); }

    // what each member gets on pay day: the share of the month they actually worked for the company
    function payslips(at) {
      return members().map((a) => {
        const from = Math.max(CO.lastPay, a.crew.hiredAt != null ? a.crew.hiredAt : 0);
        const share = Math.max(0, Math.min(1, (at - from) / E.monthMinutes));
        return { a, salary: DL.salaryOf(a), amount: Math.round(DL.salaryOf(a) * share) };
      }).filter((p) => p.amount > 0);
    }

    // Month end (00:00 on the clock): salaries were paid minute by minute; this closes the books.
    function payDay() {
      const at = nowMin();
      const slips = payslips(at);
      const total = Math.round(CO.mo.salaries);
      CO.lastPay = at;
      CO.month++;
      const m = CO.mo, income = monthIncome(m), costs = monthCosts(m);
      CO.months.unshift({ month: CO.month - 1, income: Math.round(income), costs: Math.round(costs), profit: Math.round(income - costs), invest: Math.round(m.purchases + m.hires) });
      if (CO.months.length > 6) CO.months.pop();
      CO.mo = freshMonth();
      if (total) {
        CO.paid.unshift({ month: CO.month - 1, total, n: slips.length, t: game.clock() });
        if (CO.paid.length > 6) CO.paid.pop();
      }
      if (CO.phase !== 'live') return;
      const r = CO.months[0];
      if (!E.runningCosts) game.toast('ok', 'Fechamento do mês ' + r.month, 'Receitas ' + money(r.income));
      else game.toast(r.profit >= 0 ? 'ok' : 'warn', 'Fechamento do mês ' + r.month, 'Receitas ' + money(r.income) + ' · despesas ' + money(r.costs) + ' (salários ' + money(total) + ') · ' + (r.profit >= 0 ? 'lucro ' : 'prejuízo ') + money(Math.abs(r.profit)));
      game.emit('payday', { total, slips, cash: CO.cash });
      render();
    }

    // the starter kit: the tutorial's first rack, computer, server, switch… cost nothing (setup phase)
    const kitKey = (def) => (def.kind === 'desk' || def.id === 'desk' ? 'desk' : def.unit || def.id);
    // (it stays valid until used: the tutorial buys the switch after the first server)
    function priceOf(def) {
      return CO.kit[kitKey(def)] > 0 ? 0 : def.price || 0;
    }

    // Land: what the next expansion costs (the starter kit pays the first one) and paying for it.
    function lotCost(lot, dw, dh, built) {
      return CO.kit.lot > 0 ? 0 : DL.lotPrice(lot, dw, dh, built);
    }
    function lotCharge(lot, dw, dh, built) {
      if (CO.kit.lot > 0) {
        CO.kit.lot--;
        floater('Kit inicial · expansão do terreno grátis', 'cash');
        render();
        return null;
      }
      const cost = DL.lotPrice(lot, dw, dh, built);
      if (!cost) return null;
      if (CO.cash < cost) return 'Caixa insuficiente: a expansão custa ' + money(cost) + ' (saldo ' + money(CO.cash) + ')';
      CO.cash -= cost;
      CO.spent += cost;
      CO.mo.purchases += cost;
      CO.land = (CO.land || 0) + cost;
      floater('-' + money(cost) + ' · terreno', 'spend');
      render();
      return null;
    }

    // Hiring costs money up front (recruitment + onboarding). Returns null when paid, or the reason.
    function hireCharge(role, level, pay, name) {
      if (CO.kit.hire > 0) {
        CO.kit.hire--;
        floater('Kit inicial · contratação de ' + name + ' grátis', 'cash');
        render();
        return null;
      }
      const cost = DL.hireCostFor(role, level, pay);
      if (CO.cash - cost < 0) return 'Caixa insuficiente: a contratação custa ' + money(cost);
      CO.mo.hires += cost;
      CO.cash -= cost;
      CO.spent += cost;
      CO.hired += cost;
      floater('-' + money(cost) + ' · contratação de ' + name, 'spend');
      render();
      return null;
    }

    // the first server installed (by the player) starts the real economy
    function goLive(silent) {
      if (CO.phase === 'live') return;
      CO.phase = 'live';
      CO.liveAt = nowMin();
      CO.rateAt = -1;
      if (!silent) {
        game.toast('ok', 'Primeiro servidor instalado', 'A empresa começou a operar: salários, energia, aluguel e internet entram aos poucos; servidores no ar geram receita.');
        game.emit('economy-live', {});
      }
      render();
    }
    // A fresh company for a new game: preparation phase with the starter kit (from scratch), or a
    // ready-made environment that is already operating (presets).
    function start(preset) {
      const live = preset && preset !== 'zero';
      Object.assign(CO, {
        cash: live ? E.presetCash[preset] || E.startCash * 4 : E.startCash, phase: 'setup', liveAt: 0, kit: Object.assign({}, E.starterKit),
        spent: 0, sold: 0, earned: 0, lost: 0, hired: 0, debt: 0, loans: 0, month: 1, firstContract: live, lastPay: nowMin(), paid: [], months: [], mo: freshMonth(), rateAt: -1,
        contracts: [], contractAt: 0,
      });
      CO.payAt = null;
      if (live) goLive(true);
      // a ready-made environment already meets some goals: those clients came with it (nothing paid)
      CO.seedContracts = !!live;
      render();
    }

    /* ---------- client contracts: one-off payments for reaching goals ---------- */
    function contractMet(c) {
      const n = c.need, healthy = ops.devices().filter((d) => d.kind === 'server' && d.state === 'online' && !d.fault && ops.health(d).up);
      if (n.up && healthy.length < n.up) return false;
      if (n.svc && !n.svc.every((s) => healthy.some((d) => (d.svc || null) === s))) return false;
      if (n.domain && !healthy.some((d) => d.svc === 'win' && DL.winFactor && DL.winFactor(d) >= 0.85)) return false;
      if (n.vms) {
        const inf = window.DataLabDemo && window.DataLabDemo.infra;
        if (!inf || inf.vms.filter((v) => v.status === 'running').length < n.vms) return false;
      }
      return true;
    }
    function checkContracts() {
      if (CO.phase !== 'live' || (game.paused && game.paused())) return;
      for (const c of E.contracts) {
        if (CO.contracts.indexOf(c.id) >= 0 || !contractMet(c)) continue;
        CO.contracts.push(c.id);
        if (CO.seedContracts) continue;
        const amount = Math.round((c.cash * rewardK()) / 50) * 50;
        CO.cash += amount;
        CO.earned += amount;
        CO.mo.contracts += amount;
        CLAIM.revenue += amount;
        floater('+' + money(amount) + ' · contrato', 'cash');
        game.toast('ok', 'Novo contrato · ' + c.name, c.goal + ' · +' + money(amount));
        if (sys.ops && sys.ops.logEvent) sys.ops.logEvent('info', '📄 Contrato fechado: ' + c.name + ' (+' + money(amount) + ')');
        game.emit('contract', { id: c.id, amount });
        render();
        return; // one per check: each gets its own toast
      }
      CO.seedContracts = false;
    }

    // out of cash: the bank lends once more (with a fee), repaid automatically from the profit
    function emergencyLoan() {
      const amount = E.loanAmount;
      CO.cash += amount;
      CO.debt += Math.round(amount * (1 + E.loanFee));
      CO.loans++;
      floater('+' + money(amount) + ' · empréstimo', 'cash');
      game.toast('warn', 'Empréstimo emergencial', 'O caixa zerou: o banco liberou ' + money(amount) + '. A dívida (' + money(CO.debt) + ') é paga sozinha com parte do lucro. Corte custos ou ponha mais servidores no ar.');
    }

    function tick(dt) {
      if (CO.phase !== 'live' && ops.devices().some((d) => d.kind === 'server' && !d.pre)) goLive();
      // while the tutorial is still teaching, the costs wait (the ramp starts when it is over)
      const frozen = !!(game.paused && game.paused());
      CO.frozen = frozen;
      if (CO.phase === 'live' && frozen) CO.liveAt = nowMin();
      rates();
      const live = CO.phase === 'live' && !frozen, k = CO.opexK;
      CO.problems = problems();
      CO.revenue = (CO.servers + CO.storage + CO.wifi) * rewardK();
      CO.payrollMonth = payrollMonth();
      CO.payroll = live && E.runningCosts ? (CO.payrollMonth / E.monthMinutes) * k : 0; // salaries, paid minute by minute
      if (!live || !E.runningCosts) { CO.energy = 0; CO.rent = 0; CO.link = 0; CO.maint = 0; CO.traffic = 0; }
      const mins = dt; // 1 s = 1 game minute
      const costs = CO.energy + CO.rent + CO.link + CO.maint + CO.traffic + CO.payroll;
      CO.net = CO.revenue - costs;
      // the loan is repaid from the profit
      let repay = 0;
      if (CO.debt > 0 && CO.net > 0) repay = Math.min(CO.debt, Math.max(E.loanMinRepay, CO.net * E.loanRepay) * mins);
      CO.debt -= repay;
      CO.cash += CO.net * mins - repay;
      CO.earned += CO.revenue * mins;
      const m = CO.mo;
      m.revenue += CO.revenue * mins; m.salaries += CO.payroll * mins; m.energy += CO.energy * mins; m.rent += CO.rent * mins;
      m.link += CO.link * mins; m.maint += CO.maint * mins; m.traffic += CO.traffic * mins;
      if (live) { CLAIM.revenue += CO.revenue * mins; CLAIM.opex += costs * mins; }
      // (in cloud mode the bank is the server's balance: no local emergency loans)
      if (live && !CLOUD.on && CO.cash < -500 && CO.loans < 6) emergencyLoan();
      if (nowMin() >= nextPayAtCached()) { payDay(); CO.payAt = null; }
      // keeping servers running pays credits every game hour
      CO.hourAcc += mins;
      if (CO.hourAcc >= E.credits.uptimeEvery) {
        CO.hourAcc = 0;
        const n = healthyServers();
        if (n) earn('credits', n * E.credits.uptimePerServer, n + ' servidor(es) no ar por 1 h');
      }
    }

    /* ---------- equipment bought and sold in build mode ---------- */
    game.on('purchase', (info) => {
      // the starter kit covers it (build.js asked priceOf first)
      const kk = info.def && kitKey(info.def);
      if (info.def && CO.kit[kk] > 0 && !info.price) {
        CO.kit[kk]--;
        info.kit = true;
        floater('Kit inicial · ' + info.name + ' grátis', 'cash');
        render();
        return;
      }
      CO.cash -= info.price;
      CO.spent += info.price;
      CO.mo.purchases += info.price;
      CO.rateAt = -1;
      floater('-' + money(info.price) + ' · ' + info.name, 'spend');
      render();
    });
    game.on('refund', (info) => {
      CO.cash += info.amount;
      CO.sold += info.amount;
      CO.rateAt = -1;
      floater('+' + money(info.amount) + ' · revenda', 'cash');
      render();
    });
    // build mode's undo (build.js): the purchase or the sale never happened — the money comes back whole
    game.on('purchase-undo', (info) => {
      if (info.kit) CO.kit[kitKey(info.def)] = (CO.kit[kitKey(info.def)] || 0) + 1;
      else if (info.price) {
        CO.cash += info.price;
        CO.spent -= info.price;
        CO.mo.purchases = Math.max(0, CO.mo.purchases - info.price);
        floater('+' + money(info.price) + ' · desfeito', 'cash');
      }
      CO.rateAt = -1;
      render();
    });
    game.on('refund-undo', (info) => {
      CO.cash -= info.amount;
      CO.sold = Math.max(0, CO.sold - info.amount);
      CO.rateAt = -1;
      floater('-' + money(info.amount) + ' · venda desfeita', 'spend');
      render();
    });
    game.on('world', () => { CO.rateAt = -1; });

    /* ---------- events that pay ---------- */
    game.on('job-done', (info) => earn('credits', info.auto ? E.credits.taskAuto : E.credits.taskOrder, 'Tarefa: ' + info.name, { quiet: info.auto }));
    game.on('server-online', (info) => {
      earn('credits', E.credits.serverSetup, info.d.name + ' configurado');
      // licences + configuration (the first one is part of the starter kit)
      if (info.d.pre) return;
      // the first server in the air brings the first client: the company's first revenue
      if (!CO.firstContract) {
        CO.firstContract = true;
        const amount = Math.round((E.firstContract * rewardK()) / 50) * 50;
        CO.cash += amount;
        CO.earned += amount;
        CO.mo.sales += amount;
        CLAIM.revenue += amount;
        floater('+' + money(amount) + ' · primeiro contrato', 'cash');
        game.toast('ok', 'Primeira receita!', 'O primeiro cliente contratou hospedagem: +' + money(amount) + '. Agora cada servidor no ar rende por minuto.');
      }
      if (CO.kit.config > 0) { CO.kit.config--; floater('Kit inicial · configuração grátis', 'cash'); return; }
      if (CO.phase !== 'live' || !E.runningCosts) return;
      CO.cash -= E.serverSetupFee;
      CO.mo.setup += E.serverSetupFee;
      CLAIM.opex += E.serverSetupFee;
      floater('-' + money(E.serverSetupFee) + ' · licenças e configuração', 'spend');
      render();
    });
    game.on('fixed', (info) => {
      const open = Math.max(0, scene.t - (info.at || scene.t));
      const C = E.credits;
      const speed = open <= C.fastWindow ? 1 : open >= C.slowWindow ? 0 : 1 - (open - C.fastWindow) / (C.slowWindow - C.fastWindow);
      let amount = C.incident + C.incidentFast * speed;
      if (info.by) amount *= C.crewFix;
      earn('credits', amount, 'Incidente resolvido · ' + info.d.name + ' em ' + Math.round(open) + ' min');
      // a quick fix keeps the client's SLA: a cash bonus (never a fine for a slow one)
      if (CO.phase === 'live' && open <= E.slaWindow) {
        const bonus = Math.round((E.slaBonus * (1 - open / E.slaWindow / 2) * rewardK()) / 10) * 10;
        if (bonus > 0) {
          CO.cash += bonus; CO.earned += bonus; CO.mo.contracts += bonus; CLAIM.revenue += bonus;
          floater('+' + money(bonus) + ' · SLA cumprido', 'cash');
        }
      }
      count('incidents');
      if (CLAIM.incidents.length < 20) CLAIM.incidents.push({ device: info.d.key, type: info.type || (info.d.fault && info.d.fault.type) || 'fault', open: Math.round(open), by: info.by ? 'crew' : 'player' });
    });
    // career problems that gave XP (problems.js): the server prices them with its own catalog
    game.on('problem-done', (info) => {
      if (info.xp > 0 && CLAIM.problems.length < 60) CLAIM.problems.push({ id: info.id, by: info.by === 'player' ? 'player' : 'crew', wrong: info.wrong | 0, xp: info.xp | 0 });
    });
    // XP from events that are not catalog problems (the blackout's breaker, a fire…): career.js → the same list
    game.on('career-event', (info) => {
      if (info.xp > 0 && CLAIM.problems.length < 60) CLAIM.problems.push({ id: info.id, by: 'player', wrong: 0, xp: info.xp | 0, event: true });
    });

    /* ---------- "datacenter concluído" ---------- */
    function checklist() {
      const w = world(), devs = ops.devices();
      const online = devs.filter((d) => d.kind === 'server' && d.state === 'online');
      const mine = online.filter((d) => !d.pre);
      const open = devs.filter((d) => d.fault || (d.kind === 'server' && d.state === 'online' && !ops.health(d).up)).length;
      return [
        { label: '2 servidores online', ok: online.length >= 2 },
        { label: 'Switch instalado', ok: devs.some((d) => d.kind === 'switch') },
        { label: 'Estação de trabalho', ok: w.items.some((e) => e.kind === 'desk' || (e.kind === 'monitor' && e.host)) },
        { label: '2 pessoas na equipe', ok: !!sys.crew && sys.crew.members.length >= 2 },
        { label: '1 servidor configurado por você', ok: mine.length >= 1 },
        { label: 'Nenhum incidente aberto', ok: open === 0 },
      ];
    }

    function checkDatacenter() {
      const w = world();
      if (w.dcDone || game.paused()) return;
      if (!checklist().every((c) => c.ok)) return;
      w.dcDone = true;
      CLAIM.dc_done = true;
      earn('credits', E.credits.datacenter, 'Datacenter concluído');
      earn('gold', E.gold.datacenter, 'Datacenter concluído');
      game.toast('ok', 'Datacenter concluído', 'Tudo no ar e sem incidentes · +' + E.credits.datacenter + ' créditos · +' + E.gold.datacenter + ' Gold');
      game.emit('datacenter-done', { n: W.counters.datacenters + 1 });
      count('datacenters');
    }

    /* ---------- UI ---------- */
    function render() {
      el.credits.textContent = fmt(W.credits);
      el.coins.textContent = fmt(W.gold);
      el.cash.textContent = money(CO.cash);
      // the company's result per minute: revenue minus every cost (salaries included)
      const net = CO.net || 0, setup = CO.phase !== 'live';
      el.flow.textContent = setup ? 'Preparação · sem custos' : CO.frozen && net >= 0 && !CO.revenue ? (E.runningCosts ? 'Tutorial · custos pausados' : 'Tutorial') : (net >= 0 ? 'Lucro +' : 'Prejuízo -') + money(Math.abs(net)).replace('-', '') + '/min';
      el.flow.className = 'econ__flow ' + (setup ? 'is-up' : net < 0 ? 'is-loss' : 'is-up');
      el.btn.classList.toggle('is-loss', !setup && net < 0);
      el.cash.classList.toggle('is-neg', CO.cash < 0);
      if (el.pay) {
        const kit = Object.keys(CO.kit).filter((k) => CO.kit[k] > 0).length;
        const out = CO.payroll + CO.energy + CO.rent + CO.link + CO.maint + (CO.traffic || 0);
        const txt = setup ? 'Economia começa no 1º servidor' + (kit ? ' · kit inicial ativo' : '')
          : 'Receita +' + money(CO.revenue) + '/min' + (E.runningCosts ? ' · despesas -' + money(out) + '/min' : ' · sem custos fixos') + (CO.debt > 0 ? ' · dívida ' + money(CO.debt) : '');
        if (el.pay.textContent !== txt) el.pay.textContent = txt;
        el.pay.classList.toggle('is-warn', !setup && (CO.debt > 0 || net < 0));
      }
    }

    function floater(text, cur) {
      if (!el.float) return;
      const s = document.createElement('span');
      s.className = 'econ-float is-' + cur;
      s.textContent = text;
      el.float.appendChild(s);
      setTimeout(() => s.remove(), 1600);
      while (el.float.children.length > 4) el.float.firstChild.remove();
    }

    // in-world tags over the racks that are costing money
    const tagEls = new Map();
    function updateTags() {
      const show = game.mode() !== 'build';
      const seen = new Set();
      for (const d of CO.problems) {
        if (!d.rack || !d.rack.bounds) continue;
        seen.add(d.key);
        let s = tagEls.get(d.key);
        if (!s) {
          s = document.createElement('span');
          s.className = 'loss-tag';
          el.tags.appendChild(s);
          tagEls.set(d.key, s);
        }
        const txt = '<b>' + esc(d.name) + ' · ' + d.loss.label + '</b>';
        if (s.dataset.k !== txt) { s.dataset.k = txt; s.innerHTML = txt; }
        // stack tags of the same rack
        const i = CO.problems.filter((x) => x.rack === d.rack).indexOf(d);
        const b = d.rack.bounds, p = scene.iso ? scene.itemTop(d.rack, 2) : scene.worldToScreen(b.x + b.w / 2, b.y - 2);
        s.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + (p.y - i * 34).toFixed(1) + 'px) translate(-50%,-100%)';
        s.classList.toggle('is-on', show);
      }
      for (const [k, s] of tagEls) if (!seen.has(k)) { s.remove(); tagEls.delete(k); }
    }

    function walletHtml() {
      const cl = checklist();
      const m = E.milestones[0], n = W.counters[m.counter] || 0, next = (Math.floor(n / m.every) + 1) * m.every;
      const net = CO.net || 0, setup = CO.phase !== 'live';
      const L = DL.learn ? DL.learn() : null, rk = rewardK();
      const row = (label, v, cls) => '<li><span>' + label + '</span><b class="' + (cls || '') + '">' + v + '</b></li>';
      const plus = (v) => '+' + money(v) + '/min', minus = (v) => '-' + money(v) + '/min';
      let h = '<div class="w-grid">';
      h += '<section class="w-card"><span class="eyebrow-sm">Empresa · ' + (setup ? 'fase de preparação' : 'em operação') + '</span><p class="w-big' + (CO.cash < 0 ? ' is-neg' : '') + '">' + money(CO.cash) + '</p>';
      if (setup) {
        const kit = { rack: 'rack', desk: 'computador', server: 'servidor', switch: 'switch', patch: 'patch panel', hire: '1ª contratação', config: '1ª configuração', lot: '1ª expansão do terreno' };
        const left = Object.keys(kit).filter((k) => CO.kit[k] > 0).map((k) => kit[k]);
        h += '<p class="w-note">Ainda não há custos: a empresa começa a operar quando você <b>instalar o primeiro servidor</b>. Use este orçamento para montar a primeira sala.' +
          (left.length ? ' <b>Kit inicial grátis:</b> ' + left.join(', ') + '.' : '') + '</p>';
      }
      // revenue
      h += '<span class="eyebrow-sm w-sub">Receitas</span><ul class="w-rows">' +
        row('Servidores no ar · ' + (CO.upCount || 0) + (CO.demand && CO.demand < 0.99 ? ' · demanda ' + Math.round(CO.demand * 100) + '%' : '') + (rk !== 1 ? ' (modo ' + esc(L.name) + ' ×' + rk.toLocaleString('pt-BR') + ')' : ''), plus(CO.servers * rk), 'is-up') +
        (CO.storage ? row('Storage alugado', plus(CO.storage * rk), 'is-up') : '') +
        (CO.wifi ? row('Wi-Fi de visitantes (' + CO.poe.ap + ' AP)', plus(CO.wifi * rk), 'is-up') : '') +
        row('Vendas na recepção (este mês)', '+' + money(CO.mo.sales), 'is-up') +
        row('Contratos e bônus de SLA (este mês)', '+' + money(CO.mo.contracts), 'is-up') + '</ul>';
      // costs (only when running costs are on — otherwise the cash only drops on purchases)
      if (E.runningCosts) {
      h += '<span class="eyebrow-sm w-sub">Despesas' + (!setup && CO.opexK < 1 ? ' · entrando aos poucos (' + Math.round(CO.opexK * 100) + '%)' : '') + '</span><ul class="w-rows">' +
        row('Salários (' + members().length + ' pessoa' + (members().length === 1 ? '' : 's') + ')', minus(CO.payroll)) +
        row('Energia · ' + (Math.round(CO.kw * 10) / 10).toLocaleString('pt-BR') + ' kW', minus(CO.energy)) +
        row('Aluguel · ' + (CO.tiles || 0) + ' m² de piso', minus(CO.rent)) +
        row('Link de internet', minus(CO.link)) +
        row('Manutenção · ' + (CO.devCount || 0) + ' equipamento(s)', minus(CO.maint)) +
        row('Tráfego e licenças · ' + (CO.upCount || 0) + ' servidor(es) no ar', minus(CO.traffic || 0)) +
        '<li class="w-total"><span>' + (net >= 0 ? 'Lucro' : 'Prejuízo') + ' por minuto</span><b class="' + (net >= 0 ? 'is-up' : 'is-loss') + '">' + (net >= 0 ? '+' : '-') + money(Math.abs(net)).replace('-', '') + '/min</b></li></ul>';
      } else h += '<p class="w-note">Sem custos fixos: salários, energia, aluguel e manutenção não são cobrados. O caixa só diminui quando você <b>compra</b> algo ou <b>contrata</b> alguém.</p>';
      if (CO.debt > 0) h += '<p class="w-note"><b class="is-loss">Dívida: ' + money(CO.debt) + '</b> · paga automaticamente com ' + Math.round(E.loanRepay * 100) + '% do lucro.</p>';
      // this month and the last ones
      const mo = CO.mo, inc = monthIncome(mo), cost = monthCosts(mo);
      h += '<span class="eyebrow-sm w-sub">Este mês · ' + CO.month + '</span><ul class="w-rows">' +
        row('Receitas (servidores, storage, Wi-Fi, vendas, contratos)', '+' + money(inc), 'is-up') + (E.runningCosts ? row('Salários', '-' + money(mo.salaries)) + row('Infraestrutura (energia, aluguel, link, manutenção, tráfego)', '-' + money(mo.energy + mo.rent + mo.link + mo.maint + mo.traffic)) : '') +
        (mo.setup ? row('Licenças e configuração de servidores', '-' + money(mo.setup)) : '') +
        (mo.oncall ? row('Plantões', '-' + money(mo.oncall)) : '') +
        '<li class="w-total"><span>Resultado do mês</span><b class="' + (inc - cost >= 0 ? 'is-up' : 'is-loss') + '">' + money(inc - cost) + '</b></li>' +
        row('Investimentos (compras e contratações)', '-' + money(mo.purchases + mo.hires)) + '</ul>';
      if (CO.months.length) {
        const max = Math.max(1, ...CO.months.map((x) => Math.max(Math.abs(x.income), Math.abs(x.costs))));
        h += '<div class="w-months">' + CO.months.slice().reverse().map((x) => '<div class="w-month" title="Mês ' + x.month + ': receitas ' + money(x.income) + ', despesas ' + money(x.costs) + '"><i class="is-in" style="height:' + Math.round((x.income / max) * 100) + '%"></i><i class="is-out" style="height:' + Math.round((x.costs / max) * 100) + '%"></i><small class="' + (x.profit >= 0 ? 'is-up' : 'is-loss') + '">' + (x.profit >= 0 ? '+' : '') + fmt(x.profit) + '</small><em>m' + x.month + '</em></div>').join('') + '</div>';
      }
      // payroll: who earns what (no salaries without running costs)
      if (E.runningCosts) {
      h += '<span class="eyebrow-sm w-sub">Folha de pagamento</span>' +
        '<p class="w-note w-pay">Salários debitados minuto a minuto; o mês fecha à 00:00 do relógio (1 dia = 1 mês da empresa), em <b>' + fmtIn(payIn()) + '</b>.</p>';
      if (members().length) {
        h += '<ul class="w-rows w-rows--pay">' + members().map((a) => {
          const R = DL.ROLES[a.crew.profile.role] || {};
          return '<li><span><i class="cc__dot" style="background:' + (R.color || '#ccc') + '"></i>' + esc(a.crew.name) + ' <small>' + esc(R.name || '') + ' · Nv ' + a.crew.stats.level + (a.crew.off ? ' · de folga' : '') + '</small></span><b>' + money(DL.salaryOf(a)) + '/mês</b></li>';
        }).join('') + '<li class="w-total"><span>Total mensal</span><b>-' + money(CO.payrollMonth) + '</b></li></ul>';
      } else h += '<p class="w-note">Ninguém contratado: sem folha. Contratar custa metade de um salário (recrutamento).</p>';
      if (CO.paid.length) h += '<p class="w-note">Pagos: ' + CO.paid.slice(0, 3).map((p) => 'mês ' + p.month + ' ' + money(p.total)).join(' · ') + (CO.hired ? ' · contratações ' + money(CO.hired) : '') + '</p>';
      }
      // client contracts: goals that pay once
      const left = E.contracts.filter((c) => CO.contracts.indexOf(c.id) < 0);
      h += '<span class="eyebrow-sm w-sub">Contratos de clientes · ' + (E.contracts.length - left.length) + '/' + E.contracts.length + '</span>';
      if (left.length) h += '<ul class="w-rows">' + left.slice(0, 4).map((c) => row(esc(c.name) + ' <small>' + esc(c.goal) + '</small>', '+' + money(Math.round((c.cash * rk) / 50) * 50), 'is-up')).join('') + '</ul>';
      else h += '<p class="w-note">Todos os contratos fechados.</p>';
      if (CO.problems.length) {
        h += '<span class="eyebrow-sm w-sub">Problemas abertos</span><ul class="w-rows">' + CO.problems.map((d) =>
          '<li><span>' + esc(d.name) + '</span><b class="is-loss">' + d.loss.label + '</b></li>').join('') + '</ul>' +
          '<p class="w-note">Problemas não descontam dinheiro: o equipamento só deixa de render até ser consertado. Resolver em até ' + E.slaWindow + ' min paga o bônus de SLA do cliente.</p>';
      } else h += '<p class="w-note">Nenhum problema aberto. Um servidor intermediário no ar rende ' + money(E.revenuePerServer) + '/min; básico, avançado e high-end rendem conforme o desempenho do modelo.</p>';
      if (CO.slow.length) {
        h += '<span class="eyebrow-sm w-sub">Gargalos de rede</span><ul class="w-rows">' + CO.slow.slice(0, 4).map((x) =>
          '<li><span>' + esc(x.d.name) + ' · ' + esc(x.why) + '</span><b class="is-loss">' + x.pct + '%</b></li>').join('') + '</ul>';
      }
      if (CO.poe && CO.poe.off) h += '<p class="w-note">' + CO.poe.off + ' access point(s)/câmera(s) sem energia: instale um switch PoE na mesma sala.</p>';
      if (CO.spent || CO.sold) h += '<p class="w-note">Investido em equipamentos e terreno: ' + money(CO.spent) + (CO.land ? ' (terreno ' + money(CO.land) + ')' : '') + (CO.sold ? ' · revendido: ' + money(CO.sold) : '') + '</p>';
      h += '</section>';
      h += '<section class="w-card"><span class="eyebrow-sm">Saldos do jogador · separados do caixa da empresa</span>' +
        '<div class="w-bal"><div><span class="cur cur--cr">◆</span><b>' + fmt(W.credits) + '</b><small>Créditos · ganhos jogando</small></div>' +
        '<div><span class="cur cur--dc">⬢</span><b class="is-gold">' + fmt(W.gold) + '</b><small>Gold · moeda dourada (skins, itens especiais, bots lendários)</small></div></div>' +
        '<div class="w-xchg"><span>Câmbio: ' + E.gold.rate + ' créditos = 1 Gold</span>' +
        [100, 500].map((n) => '<button type="button" class="btn btn--sm" data-xchg="' + n + '"' + (W.credits < n ? ' disabled' : '') + '>' + n + ' ◆ → ' + n / E.gold.rate + ' Gold</button>').join('') + '</div>' +
        '<span class="eyebrow-sm w-sub">Progresso</span><p class="w-prog"><b>' + n + '</b> datacenter(s) concluído(s) · próxima recompensa em <b>' + next + '</b></p>' +
        '<div class="w-bar"><i style="transform:scaleX(' + ((n % m.every) / m.every).toFixed(3) + ')"></i></div>' +
        '<span class="eyebrow-sm w-sub">Este datacenter' + (world().dcDone ? ' · concluído ✓' : '') + '</span><ul class="w-check">' +
        cl.map((c) => '<li class="' + (c.ok ? 'is-ok' : '') + '"><i></i>' + c.label + '</li>').join('') + '</ul></section>';
      const real = CLOUD.on && DL.PaymentService;
      h += '<section class="w-card w-card--wide"><span class="eyebrow-sm">Pacotes de Gold · Pix</span><div class="w-store">' + E.store.map((p) =>
        '<button type="button" class="w-pack" data-sku="' + p.sku + '"><span class="cur cur--dc">⬢</span><b>' + fmt(p.coins) + '</b>' + (p.tag ? '<em>' + p.tag + '</em>' : '') + '<small>' + p.price + '</small></button>').join('') +
        '</div><p class="w-note">' + (real ? 'O Pix abre numa nova aba, pela AbacatePay. O Gold entra na sua conta assim que o pagamento é confirmado.' : 'Entre na sua conta para comprar Gold: o pagamento é feito por Pix, pela AbacatePay.') + '</p>' +
        '<span class="eyebrow-sm w-sub">Extrato</span><ul class="w-ledger">' + (W.ledger.slice(0, 6).map((l) =>
          '<li><span class="mono">' + l.t + '</span><span>' + esc(l.why) + '</span><b class="' + (curOf(l.cur) === 'gold' ? 'is-dc' : '') + '">' + (l.amount > 0 ? '+' : '') + fmt(l.amount) + (curOf(l.cur) === 'gold' ? ' ⬢' : ' ◆') + '</b></li>').join('') || '<li class="m">Nada ainda. Conclua tarefas e resolva incidentes.</li>') + '</ul></section>';
      return h + '</div>';
    }

    function openWallet() {
      el.walletBody.innerHTML = walletHtml();
      el.wallet.classList.add('is-open');
      game.keysReset && game.keysReset();
    }
    function closeWallet() { el.wallet.classList.remove('is-open'); }

    function showReward() {
      const q = queue.shift();
      if (!q) return;
      const { m, n } = q;
      const parts = [];
      if (m.reward.gold || m.reward.datacoins) parts.push('<p class="rw-amount"><span class="cur cur--dc">⬢</span>+' + fmt(m.reward.gold || m.reward.datacoins) + '<small>Gold</small></p>');
      if (m.reward.credits) parts.push('<p class="rw-amount"><span class="cur cur--cr">◆</span>+' + fmt(m.reward.credits) + '<small>Créditos</small></p>');
      el.rewardBody.innerHTML = '<p class="eyebrow-sm"><span class="dot dot--live"></span>&nbsp; Recompensa · ' + esc(m.title) + '</p>' +
        '<h2 class="card__title card__title--sm">' + esc(m.label(n)) + '</h2>' + parts.join('') +
        '<div class="rw-prog"><span class="eyebrow-sm">Progresso</span><b>' + n + '</b><div class="w-bar"><i style="transform:scaleX(1)"></i></div><small>Próximo marco: ' + (n + m.every) + '</small></div>';
      el.reward.classList.add('is-open');
      game.sfx('done');
    }
    function closeReward() {
      el.reward.classList.remove('is-open');
      if (queue.length) setTimeout(showReward, 250);
    }

    el.btn.addEventListener('click', () => { el.btn.blur(); openWallet(); });
    $('walletClose').addEventListener('click', closeWallet);
    $('rewardClose').addEventListener('click', closeReward);
    el.wallet.addEventListener('pointerdown', (ev) => { if (ev.target === el.wallet) closeWallet(); });
    el.walletBody.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-xchg]');
      if (x && CLOUD.on && DL.EconomyService) {
        x.disabled = true;
        DL.EconomyService.exchange(+x.dataset.xchg).then((r) => {
          if (!r.ok) game.toast('warn', 'Câmbio', r.message);
          if (el.wallet.classList.contains('is-open')) el.walletBody.innerHTML = walletHtml();
        });
        return;
      }
      if (x) {
        const why = exchange(+x.dataset.xchg);
        if (why) game.toast('warn', 'Câmbio', why);
        el.walletBody.innerHTML = walletHtml();
        return;
      }
      const b = ev.target.closest('[data-sku]');
      if (!b || b.disabled) return;
      const pack = E.store.find((p) => p.sku === b.dataset.sku);
      // Gold is only bought with an account: Pix through AbacatePay, credited by the server
      if (CLOUD.on && DL.PaymentService) DL.PaymentService.buy(pack.sku, game.toast);
      else game.toast('info', 'Comprar Gold', 'Entre na sua conta para comprar Gold por Pix.');
    });

    function update(dt) {
      tick(dt);
      CO.acc += dt;
      if (CO.acc > 0.25) {
        CO.acc = 0;
        render();
        if (el.wallet.classList.contains('is-open') && !el.walletBody.querySelector('.is-busy')) {
          const sc = el.walletBody.scrollTop;
          el.walletBody.innerHTML = walletHtml();
          el.walletBody.scrollTop = sc;
        }
      }
      CO.dcChecked += dt;
      if (CO.dcChecked > 1) { CO.dcChecked = 0; checkDatacenter(); checkContracts(); }
    }

    function key(ev) {
      if (ev.code === 'Escape' || ev.code === 'Enter') {
        if (el.reward.classList.contains('is-open')) { closeReward(); return true; }
        if (ev.code === 'Escape') { closeWallet(); return true; }
      }
      return true;
    }

    render();
    return {
      update, updateUi: updateTags, key, earn, spend, exchange, grant, count, checklist, lossOf, openWallet, closeWallet,
      hireCharge, payDay, start, priceOf, goLive, lotCost, lotCharge,
      get phase() { return CO.phase; },
      // an operating cost outside the per-minute rates (on-call cover): counted with the month's costs
      charge(amount, why) { if (!E.runningCosts) return; CO.cash -= amount; CO.mo.oncall += amount; CLAIM.opex += amount; floater('-' + money(amount) + ' · ' + why, 'spend'); render(); },
      // a fine (blackout.js: the client contracts' SLA while the racks are without power): always charged,
      // counted with the month's costs; quiet = no floating "−$" this time
      penalty(amount, why, quiet) { amount = Math.round(amount); if (!(amount > 0)) return; CO.cash -= amount; CO.mo.oncall += amount; CLAIM.opex += amount; if (!quiet) floater('-' + money(amount) + ' · ' + why, 'spend'); render(); },
      // an improvement bought for something already placed (clima.js: a better cooling model): it comes off the
      // cash now and goes to the server with the save's costs. false = not enough money
      upgrade(amount, why) {
        amount = Math.round(amount);
        if (!(amount > 0) || CO.cash < amount) return false;
        CO.cash -= amount; CO.mo.purchases += amount; CLAIM.opex += amount;
        floater('-' + money(amount) + ' · ' + why, 'spend');
        render();
        return true;
      },
      income(amount, why) { CO.cash += amount; CO.earned += amount; CO.mo.sales += amount; CLAIM.revenue += amount; floater('+' + money(amount) + ' · ' + why, 'cash'); render(); },
      /* ---------- cloud (services/*.js) ---------- */
      get cloud() { return CLOUD.on; },
      // turn cloud mode on with the server's balances, or off back to this browser's own wallet
      setCloud(on, wallet) {
        if (on && !CLOUD.on) CLOUD.local = { credits: W.credits, gold: W.gold, ledger: W.ledger.slice() };
        if (!on && CLOUD.on && CLOUD.local) Object.assign(W, CLOUD.local);
        CLOUD.on = !!on;
        if (on && wallet) { W.gold = wallet.gold; W.credits = wallet.credits; W.ledger = []; }
        resetClaim();
        render();
      },
      // what this session earned / spent since the last save (the server validates and caps it)
      takeClaim() {
        const c = { elapsed_min: Math.max(0, Math.round(nowMin() - CLAIM.since)), revenue: Math.round(CLAIM.revenue), opex: Math.round(CLAIM.opex),
          credits: Math.round(CLAIM.credits), incidents: CLAIM.incidents.slice(0, 20), problems: CLAIM.problems.slice(0, 30), dc_done: CLAIM.dc_done || !!world().dcDone, phase: CO.phase };
        return c;
      },
      resetClaim,
      // after a save: the server counts only a few solved problems per save (career_settle: one per 20 game
      // minutes + 1). What it did not get to goes back to the front of the list, for the next save.
      // `sent`: the list that went · `car`: the server's answer ({ runs, v }) → the XP still waiting
      requeueProblems(sent, car) {
        if (!Array.isArray(sent) || !car || typeof car.runs !== 'number') return 0;
        const events = (car.v | 0) >= 2; // older servers skip events without counting them
        let left = car.runs, wait = [];
        for (const r of sent) {
          if (r.event && !events) continue; // not known there: nothing to wait for
          if (left > 0) left--; else wait.push(r);
        }
        if (wait.length) CLAIM.problems = wait.concat(CLAIM.problems).slice(0, 60);
        return wait.reduce((n, r) => n + (r.xp | 0), 0);
      },
      // the server's answer wins: cash, kit, phase, month, balances
      applyServer(s) {
        if (!s) return;
        if (s.cash != null) CO.cash = Number(s.cash);
        CO.kit = {};
        if (s.phase === 'live' && CO.phase !== 'live') goLive(true);
        if (s.month) CO.month = Math.max(CO.month, s.month);
        if (s.first_contract != null) CO.firstContract = !!s.first_contract;
        if (s.gold != null) W.gold = Number(s.gold);
        if (s.credits != null) W.credits = Number(s.credits);
        if (s.wallet) { W.gold = Number(s.wallet.gold); W.credits = Number(s.wallet.credits); }
        render();
        game.emit('wallet', { server: true });
      },
      // the company part of a save (and restoring it)
      snapshot() { return { phase: CO.phase, month: CO.month, kit: Object.assign({}, CO.kit), firstContract: !!CO.firstContract, cash: Math.round(CO.cash), debt: Math.round(CO.debt), loans: CO.loans, dcDone: !!world().dcDone, contracts: CO.contracts.slice() }; },
      restore(s) {
        if (!s) return;
        // (saves from before contracts existed: the goals already met came with the company — no payout)
        Object.assign(CO, { cash: Number(s.cash) || 0, kit: {}, month: s.month || 1, firstContract: !!s.firstContract, debt: s.debt || 0, loans: s.loans || 0, lastPay: nowMin(), payAt: null, rateAt: -1, mo: freshMonth(), months: [], paid: [],
          contracts: Array.isArray(s.contracts) ? s.contracts.filter((x) => typeof x === 'string').slice(0, 50) : [], seedContracts: !Array.isArray(s.contracts) });
        CO.phase = 'setup';
        if (s.phase === 'live') goLive(true);
        if (s.dcDone) world().dcDone = true;
        resetClaim();
        render();
      },
      get payIn() { return payIn(); },
      payInText: () => fmtIn(payIn()),
      get isOpen() { return el.wallet.classList.contains('is-open') || el.reward.classList.contains('is-open'); },
      get wallet() { return W; },
      get company() { return CO; },
      money,
    };
  };
})();
