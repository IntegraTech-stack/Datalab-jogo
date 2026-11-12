// Checks that the crew understands how people really write (slang, typos, emojis, mixed questions), no browser needed.
// usage: node tests/sim-talk.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const sandbox = {};
sandbox.window = sandbox;
sandbox.DL = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets/js/talk-brain.js'), 'utf8'), sandbox, { filename: 'talk-brain.js' });
const B = sandbox.DL.Brain;

// [what the player writes, the intent expected]
const CASES = [
  // greetings & small talk
  ['oi', 'greet'], ['e aí mano', 'greet'], ['eai', 'greet'], ['salve', 'greet'], ['bom diaaaa', 'greet'], ['opa', 'greet'], ['fala parceiro', 'greet'],
  ['tudo bem?', 'smalltalk'], ['td certo vc?', 'smalltalk'], ['de boa?', 'smalltalk'], ['suave?', 'smalltalk'], ['beleza?', 'smalltalk'], ['como vc tá hj', 'smalltalk'], ['alguma novidade?', 'smalltalk'],
  ['tchau', 'bye'], ['flw', 'bye'], ['vlw flw', 'thanks'], ['até amanhã', 'bye'], ['vou nessa', 'bye'],
  // feelings & chat
  ['vlw', 'thanks'], ['valeeeeu!', 'thanks'], ['obg', 'thanks'], ['muito obrigado', 'thanks'], ['kkkkkkk', 'laugh'], ['😂😂', 'laugh'], ['rsrs', 'laugh'], ['hahaha', 'laugh'],
  ['vc é um robô?', 'isbot'], ['vc é bot?', 'isbot'], ['você é uma IA?', 'isbot'], ['qual seu nome?', 'who'], ['quem é vc', 'who'], ['como vc se chama', 'who'],
  ['quantos anos vc tem', 'personal'], ['onde vc mora', 'personal'], ['vc gosta de trabalhar aqui?', 'jobfeel'], ['tá feliz aqui?', 'jobfeel'],
  ['to cansado', 'feelUser'], ['estou muito estressado', 'feelUser'], ['to de saco cheio', 'feelUser'], ['vc tá cansado?', 'feelBot'], ['tô entediado', 'bored'], ['conversa comigo', 'bored'],
  ['parabéns!', 'compliment'], ['mandou bem', 'compliment'], ['vc é top', 'compliment'], ['vc é muito bom', 'compliment'], ['você é um burro', 'insult'], ['seu inútil', 'insult'], ['foi mal', 'sorry'], ['desculpa aí', 'sorry'],
  ['me conta uma piada', 'joke'], ['conta uma', 'joke'], ['tem café?', 'coffee'], ['bora almoçar', 'coffee'], ['tô com fome', 'coffee'],
  ['viu o jogo do flamengo?', 'hobby'], ['curte música?', 'hobby'], ['assistiu algum filme?', 'hobby'], ['joga videogame?', 'hobby'], ['como foi o fim de semana', 'hobby'],
  ['que horas são?', 'time'], ['vai chover hoje?', 'weather'], ['o que vc sabe fazer?', 'abilities'], ['ajuda', 'abilities'], ['tá aí?', 'wait'], ['alô', 'wait'],
  ['sim', 'yes'], ['claro', 'yes'], ['pode ser', 'yes'], ['não', 'no'], ['deixa pra lá', 'no'], ['ok', 'confirm'], ['entendi', 'confirm'], ['por que?', 'why'], ['como assim?', 'why'], ['me explica', 'why'], ['e aí?', 'greet'], ['e o resto?', 'more'],
  // the datacenter
  ['como tão os servidores?', 'servers'], ['como estão os servs', 'servers'], ['os sv tão ok?', 'servers'], ['como tá a rede', 'network'], ['a net tá lenta', 'network'], ['o switch caiu?', 'problems'], ['tem algum problema?', 'problems'],
  ['deu ruim?', 'problems'], ['tem erro aí?', 'problems'], ['ta tudo bugado', 'problems'], ['o servidor travou', 'problems'], ['fudeu, caiu tudo', 'problems'],
  ['resolve isso pra mim', 'fix'], ['conserta aí', 'fix'], ['arruma isso', 'fix'], ['onde é o problema?', 'where'], ['me mostra', 'where'],
  ['como tá a grana?', 'money'], ['quanto dinheiro temos', 'money'], ['estamos no vermelho?', 'money'], ['e as finanças', 'money'], ['tem lucro?', 'money'],
  ['o que eu faço agora?', 'next'], ['qual a prioridade', 'next'], ['por onde começo', 'next'], ['tá quente aí?', 'temp'], ['qual a temperatura', 'temp'],
  ['o que vc tá fazendo?', 'doing'], ['no q vc tá trabalhando', 'doing'], ['qual seu turno', 'shift'], ['qnd vc sai', 'shift'], ['quanto vc ganha', 'salary'], ['tem ordem de serviço?', 'orders'], ['como tão as vms', 'vms'],
  ['qual seu nível', 'self'],
  // typos
  ['como estao os servidro?', 'servers'], ['tem algum probelma', 'problems'], ['como esta a rrede', 'network'], ['qual a temperatua', 'temp'], ['me conta uma piadda', 'joke'],
  // greeting + real question
  ['oi, tem algum problema?', 'problems'], ['e aí, td certo? qnd vc sai?', 'shift'], ['bom dia! como tão os servidores?', 'servers'],
  // nonsense stays unknown
  ['asdf qwer', 'unknown'], ['blablabla xyz', 'unknown'], ['', 'unknown'],
];

let bad = 0;
for (const [text, want] of CASES) {
  const got = B.detect(text);
  if (got !== want) { bad++; console.log('✗ ' + JSON.stringify(text) + ' → ' + got + ' (esperado ' + want + ')  [limpo: "' + B.norm(text) + '"]'); }
}
// two questions in one message
const MULTI = [['como estão os servidores e a rede?', ['servers', 'network']], ['tem problema? e as finanças?', ['problems', 'money']]];
for (const [text, want] of MULTI) {
  const got = B.detectAll(text);
  if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('✗ multi ' + JSON.stringify(text) + ' → ' + JSON.stringify(got)); }
}
console.log((CASES.length + MULTI.length - bad) + '/' + (CASES.length + MULTI.length) + ' ok');
process.exit(bad ? 1 : 0);
