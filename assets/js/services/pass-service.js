/* DataLab — Pass service: the season pass of the account (Edge Function "pass", battlepass.js).
   state: the pass as the server keeps it. sync: the XP and the finished missions the game saw since the
   last sync; the server caps them, raises the level and puts the rewards in the inventory — the answer
   carries the pass and the full inventory state (which DL.Inventory applies). */
(function () {
  'use strict';
  const DL = window.DL;
  DL.PassService = {
    state: () => DL.Cloud.call('pass', { action: 'state' }),
    sync: (body) => DL.Cloud.call('pass', Object.assign({ action: 'sync', request_id: DL.Cloud.requestId() }, body)),
  };
})();
