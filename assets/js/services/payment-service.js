/* DataLab — Payment service: buying Gold with real money (Edge Function "payments" → AbacatePay).
   The server opens a checkout tied to this account; the payment page opens in a new tab and the game
   keeps asking the server until AbacatePay confirms it. Gold is credited only by the server. */
(function () {
  'use strict';
  const DL = window.DL;
  const POLL_MS = 4000, GIVE_UP_MS = 30 * 60 * 1000;
  const S = { order: null, timer: 0, since: 0, busy: false, notify: null };

  function applyState(state) {
    if (!state) return;
    if (DL.EconomyService && state.wallet) DL.EconomyService.apply(state.wallet);
    if (DL.InventoryService) DL.InventoryService.applied(state);
  }

  function stop() {
    clearTimeout(S.timer);
    S.timer = 0;
    S.order = null;
    removeEventListener('focus', check);
  }

  async function check() {
    if (!S.order || S.busy) return;
    S.busy = true;
    const r = await DL.Cloud.call('payments', { action: 'status', order_id: S.order.id });
    S.busy = false;
    if (!S.order) return;
    if (r.ok && r.data.status !== 'pending') {
      const o = S.order;
      stop();
      applyState(r.data.state);
      if (r.data.status === 'paid') S.notify('ok', 'Pagamento confirmado', '+' + r.data.coins + ' Gold na sua conta');
      else if (r.data.status === 'failed') S.notify('warn', 'Pagamento', 'O valor pago não confere com o pacote. Fale com o suporte · pedido ' + o.id.slice(0, 8));
      else S.notify('info', 'Pagamento', 'O checkout ' + (r.data.status === 'expired' ? 'expirou' : 'foi cancelado') + '. Nenhuma cobrança foi feita.');
      return;
    }
    if (Date.now() - S.since > GIVE_UP_MS) {
      stop();
      S.notify('info', 'Pagamento', 'Se você pagou, o Gold aparece na sua conta assim que a AbacatePay confirmar.');
      return;
    }
    S.timer = setTimeout(check, POLL_MS);
  }

  DL.PaymentService = {
    get pending() { return !!S.order; },
    // Must be called from the click itself: the tab is opened before the network call so pop-up
    // blockers allow it. notify(tone, title, text) shows the outcome.
    async buy(sku, notify) {
      S.notify = notify;
      if (S.order) { notify('info', 'Pagamento', 'Já tem um pagamento aberto: conclua na outra aba.'); return { ok: false }; }
      const tab = window.open('', '_blank');
      if (tab) tab.opener = null; // the payment page must not reach back into the game
      if (tab) { try { tab.document.title = 'Pagamento · DataLab'; tab.document.body.textContent = 'Abrindo o pagamento…'; } catch (e) { /* cross-origin later */ } }
      const r = await DL.Cloud.call('payments', { action: 'checkout', sku });
      if (!r.ok) {
        if (tab) tab.close();
        notify('warn', 'Pagamento', r.message);
        return r;
      }
      if (tab) tab.location.href = r.data.url;
      else if (!window.open(r.data.url, '_blank')) {
        notify('warn', 'Pagamento', 'O navegador bloqueou a nova aba. Permita pop-ups deste site e tente de novo.');
        return { ok: false };
      }
      S.order = { id: r.data.order_id };
      S.since = Date.now();
      addEventListener('focus', check);
      S.timer = setTimeout(check, POLL_MS);
      notify('info', 'Pagamento aberto', 'Pague o Pix na aba da AbacatePay. O Gold entra aqui sozinho.');
      return r;
    },
  };
})();
