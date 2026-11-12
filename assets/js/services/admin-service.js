/* DataLab — Admin service (staff only). The browser just asks: the Edge Function "admin" checks the
   caller's role and the database checks it again; hiding the panel is not the protection. */
(function () {
  'use strict';
  const DL = window.DL;
  const call = (body) => DL.Cloud.call('admin', body);
  DL.AdminService = {
    GRANT_TYPES: [['founder', 'Founder'], ['developer', 'Developer'], ['beta', 'Beta Tester'], ['event', 'Evento'], ['compensation', 'Compensação'], ['special', 'Especial']],
    whoami: () => call({ action: 'whoami' }),
    findUsers: (query) => call({ action: 'find_users', query: String(query || '').slice(0, 40) }),
    // { user_id, item_id | currency, quantity, grant_type, reason }
    grant: (g) => call(Object.assign({ action: 'grant', request_id: DL.Cloud.requestId() }, g)),
    log: (limit) => call({ action: 'log', limit: limit || 50 }),
    setRole: (userId, role, enabled) => call({ action: 'set_role', user_id: userId, role, enabled: !!enabled }),
    setTitle: (userId, title, enabled) => call({ action: 'set_title', user_id: userId, title, enabled: !!enabled }),
  };
})();
