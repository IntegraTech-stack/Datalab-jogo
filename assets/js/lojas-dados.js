/* DataLab — as lojinhas da rua: os nomes (letreiro, nome da loja, quem atende no balcão).
   · lojaSkins  — a loja de toldo azul, à direita do DataLab.
   · lojaCafe   — o café de toldo laranja, à esquerda do DataLab.
   Quem atende no balcão abre a MESMA Loja do botão LOJA do topo (inventory.js, openShop): mesmos itens,
   mesmo Gold e créditos, mesma compra pelo servidor. Nada aqui tem preço.
   Os interiores ficam em lojas.js; as fachadas em street.js. */
(function () {
  'use strict';
  const DL = window.DL;
  if (!DL) return;

  // letreiro: o texto do neon na fachada (letras, números, espaço, ponto, hífen, ! e /)
  // nome: como aparece no aviso "E · Entrar"
  // papel: o que aparece no aviso "E · Loja" sobre quem atende
  DL.LOJAS = {
    lojaSkins: {
      letreiro: 'SKIN.EXE', nome: 'Skin.exe',
      vendedores: {
        skins: { nome: 'Lia', papel: 'Skins' },
        equip: { nome: 'Davi', papel: 'Equipamentos' },
      },
    },
    lojaCafe: {
      letreiro: 'CAFE BYTE', nome: 'Café Byte',
      barista: { nome: 'Duda', papel: 'Especiais' },
    },
  };
})();
