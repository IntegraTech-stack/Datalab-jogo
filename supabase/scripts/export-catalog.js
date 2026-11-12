/* DataLab — export the game's catalog for the database seed.
   Open demo.html in the browser, paste this into the DevTools console and press Enter: it downloads
   catalog-export.json. Then:  node supabase/scripts/build-seed.mjs catalog-export.json > supabase/seed.sql
   (Keeps the shop items, prices, hardware and presets in the database identical to the client.) */
(() => {
  const DL = window.DL;
  const cat = DL.CATALOG.map((d) => ({ id: d.id, kind: d.kind || d.id, cat: d.cat, group: d.group || null, name: d.name, price: d.price || 0, mount: d.mount || null, unit: d.unit || null }));
  const presets = {};
  for (const id of DL.PRESET_ORDER) {
    const p = DL.PRESETS[id], counts = {};
    for (const [kind, , , , units] of p.items || []) {
      counts[kind] = (counts[kind] || 0) + 1;
      for (const u of units || []) { const k = u === 'W' ? 'switch' : u === 'P' ? 'patch' : 'server'; counts[k] = (counts[k] || 0) + 1; }
    }
    presets[id] = { lot: p.def ? p.def.lot : { w: 10, h: 9 }, items: counts, crew: (p.crew || []).length, name: p.name };
  }
  const E = DL.ECON;
  const out = {
    cat, hw: DL.HW, presets,
    econ: { startCash: E.startCash, presetCash: E.presetCash, kit: E.starterKit, lot: E.lot, salary: E.salary, salaryCustom: E.salaryCustom, salaryPerLevel: E.salaryPerLevel,
      hireFee: E.hireFee, revenuePerServer: E.revenuePerServer, gold: E.gold, credits: E.credits, storagePerTB: E.storagePerTB, wifiPerAp: E.wifiPerAp,
      firstContract: E.firstContract, serverSetupFee: E.serverSetupFee, monthMinutes: E.monthMinutes, opexFloor: E.opexFloor, opexRamp: E.opexRamp },
    svc: Object.fromEntries(Object.entries(DL.SVC).map(([k, v]) => [k, { name: v.name, short: v.short, color: v.color }])),
    cosmetics: DL.COSMETICS, rarity: DL.RARITY, events: DL.EVENTS, groups: DL.COSMETIC_GROUPS.map((g) => ({ id: g.id, name: g.name })),
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
  a.download = 'catalog-export.json';
  a.click();
  return out;
})();
