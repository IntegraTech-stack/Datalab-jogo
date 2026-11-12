/* DataLab — Economy service: money operations validated by the server (Edge Function "economy").
   The game keeps simulating locally for responsiveness; the server owns the balances. */
(function () {
  'use strict';
  const DL = window.DL;
  const game = () => window.DataLabDemo;
  const apply = (data) => { const D = game(); if (D && data) D.economy.applyServer(data); };

  DL.EconomyService = {
    // créditos → Gold (10:1), on the server
    async exchange(credits) {
      const r = await DL.Cloud.call('economy', { action: 'exchange', credits: Math.floor(credits), request_id: DL.Cloud.requestId() });
      if (r.ok) { apply(r.data); if (DL.InventoryService) DL.InventoryService.applied(r.data); }
      return r;
    },
    // buy land for the save in `slot` (company cash, priced on the server)
    async expandLot(slot, dw, dh, built) {
      const r = await DL.Cloud.call('economy', { action: 'expand_lot', slot, dw, dh, built: Math.max(0, Math.round(built || 0)), request_id: DL.Cloud.requestId() });
      if (r.ok) apply(r.data);
      return r;
    },
    apply,
  };
})();
