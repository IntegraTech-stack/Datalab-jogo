/* DataLab — spotify-callback.html: finishes the Spotify login started by the in-game player. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const search = location.search;
  // drop the code / state from the address bar (and history) before anything else
  history.replaceState(null, '', location.pathname);

  const FAIL = {
    denied: ['Login cancelado.', 'Você não autorizou o DataLab no Spotify. Pode fechar esta janela.'],
    expired: ['Login expirado.', 'Este link de login já foi usado ou demorou demais. Volte ao jogo e clique em Conectar de novo.'],
    state: ['Login inválido.', 'A resposta do Spotify não confere com o pedido feito pelo jogo. Volte ao jogo e tente de novo.'],
    disabled: ['Spotify não configurado.', 'O Client ID do Spotify não está no config.js deste site.'],
  };

  DL.Spotify.finishLogin(search).then((r) => {
    if (r.ok) {
      $('mark').textContent = '✓';
      $('title').textContent = 'Spotify conectado.';
      $('text').textContent = 'Pode voltar ao jogo: o player já mostra o que está tocando.';
      // popup opened by the game: close it; a normal tab (popup blocked/reloaded) keeps the button
      try { window.close(); } catch (e) { /* not ours to close */ }
    } else {
      const f = FAIL[r.code] || ['Não deu para conectar.', 'O Spotify recusou o pedido' + (r.detail ? ' (' + r.detail + ')' : '') + '. Volte ao jogo e tente de novo.'];
      $('box').classList.add('is-error');
      $('mark').textContent = '!';
      $('title').textContent = f[0];
      $('text').textContent = f[1];
    }
    $('back').hidden = false;
  });
})();
