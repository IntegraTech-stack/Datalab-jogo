/* DataLab — Inventory service: the persistent inventory on the server (Edge Functions "shop" and
   "inventory"). Every answer is the full inventory state, which DL.Inventory applies. */
(function () {
  'use strict';
  const DL = window.DL;
  const listeners = [];
  const done = (r) => { if (r.ok) listeners.forEach((fn) => fn(r.data)); return r; };

  DL.InventoryService = {
    onState(fn) { listeners.push(fn); },
    applied(data) { if (data && data.items) listeners.forEach((fn) => fn(data)); },
    state: () => DL.Cloud.call('shop', { action: 'state' }).then(done),
    buy: (itemId) => DL.Cloud.call('shop', { action: 'purchase', item_id: itemId, request_id: DL.Cloud.requestId() }).then(done),
    claim: (itemId) => DL.Cloud.call('shop', { action: 'claim', item_id: itemId }).then(done),
    sell: (itemId) => DL.Cloud.call('inventory', { action: 'sell', item_id: itemId, request_id: DL.Cloud.requestId() }).then(done),
    equip: (itemId) => DL.Cloud.call('inventory', { action: 'equip', item_id: itemId }).then(done),
    unequip: (slot) => DL.Cloud.call('inventory', { action: 'unequip', slot }).then(done),
    consume: (itemId) => DL.Cloud.call('inventory', { action: 'consume', item_id: itemId, request_id: DL.Cloud.requestId() }).then(done),
  };
})();
