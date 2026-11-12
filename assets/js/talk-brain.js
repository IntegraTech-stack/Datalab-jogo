/* DataLab — talk-brain: how the crew UNDERSTANDS what the player writes (talk.js and staff.js use it).
   Still rules, no external AI, but a lot more forgiving than plain keywords:
     1. clean():   lower case, no accents, emojis → words, "valeeeu" → "valeu", "kkkkk" → "k"
     2. slang:     "vc tbm tá de boa?" → "voce tambem esta de boa?" (big Brazilian-Portuguese dictionary)
     3. typos:     "servidro", "probelma", "rede cayu" → the closest known word (only when it is unambiguous)
     4. intents:   ordered patterns (greeting, small talk, feelings, jokes, who are you, football, servers, network…)
     5. follow-up: "e a rede?", "por quê?", "sim", "e aí?" are read against the last thing that was talked about
   Pure functions: no DOM, so tests/sim-talk.js can run it in Node. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  /* ---------- 1. cleaning ---------- */
  const EMOJI = [
    [/[😂🤣😹😆😁😄😅]/gu, ' k '], [/[❤💙💚💜🧡💛🥰😍😘]/gu, ' amo '], [/[👍👌🙌👏🤝💪🔥]/gu, ' show '],
    [/[😢😭😞😔🥲]/gu, ' triste '], [/[😡🤬😠]/gu, ' raiva '], [/[😴🥱]/gu, ' sono '], [/[🤔🧐]/gu, ' hmm '], [/[🙏]/gu, ' por favor '],
  ];
  const strip = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function clean(s) {
    s = strip(s).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');
    s = s.replace(/(.)\1{2,}/g, '$1');         // valeeeu → valeu · kkkkk → k · ooooi → oi
    s = s.replace(/([aiukhy])\1/g, '$1');       // vaaleu → valeu · kk → k (Portuguese has no double a/i/u)
    s = s.replace(/[^a-z0-9@\s?!.,\-_#]/g, ' ');
    return s;
  }

  /* ---------- 2. slang (word → words) ---------- */
  const SLANG = {
    vc: 'voce', vcs: 'voces', voxe: 'voce', ce: 'voce', oce: 'voce', tb: 'tambem', tbm: 'tambem', tmb: 'tambem', tambm: 'tambem', tl: 'ta ligado', tlgd: 'ta ligado',
    blz: 'beleza', bele: 'beleza', fmz: 'firmeza', pq: 'porque', pqe: 'porque', q: 'que', qe: 'que', oq: 'o que', oque: 'o que', n: 'nao', nn: 'nao', naum: 'nao', nao: 'nao',
    s: 'sim', ss: 'sim', sim: 'sim', simm: 'sim', aham: 'sim', uhum: 'sim', hj: 'hoje', agr: 'agora', mt: 'muito', mto: 'muito', mta: 'muita', mtos: 'muitos', mtas: 'muitas',
    td: 'tudo', tds: 'todos', ngm: 'ninguem', obg: 'obrigado', obgd: 'obrigado', obgda: 'obrigada', brigado: 'obrigado', brigada: 'obrigada', vlw: 'valeu', vlww: 'valeu', vlws: 'valeu',
    flw: 'falou', falow: 'falou', tmj: 'tamo junto', tamojunto: 'tamo junto', pfv: 'por favor', pf: 'por favor', pls: 'por favor', plz: 'por favor', pfvr: 'por favor',
    cmg: 'comigo', ctg: 'contigo', ctz: 'certeza', kd: 'cade', qnd: 'quando', qdo: 'quando', qto: 'quanto', qnt: 'quanto', qntos: 'quantos', msm: 'mesmo', mermo: 'mesmo', mermao: 'mano',
    dps: 'depois', ent: 'entao', eae: 'e ai', iae: 'e ai', eai: 'e ai', oie: 'oi', oii: 'oi', ola: 'ola', sla: 'sei la', fds: 'fim de semana', sdds: 'saudade', aki: 'aqui', ai: 'ai', ae: 'ai',
    eh: 'e', sv: 'servidor', serv: 'servidor', servs: 'servidores', srvs: 'servidores', cfg: 'config', bd: 'bom dia', bt: 'boa tarde', bn: 'boa noite', tdb: 'tudo bem', tdbm: 'tudo bem', mds: 'meu deus',
    ta: 'esta', to: 'estou', tou: 'estou', tao: 'estao', tamo: 'estamos', tava: 'estava', tavam: 'estavam', pra: 'para', pro: 'para o', pros: 'para os', pras: 'para as', pa: 'para', p: 'para',
    cade: 'cade', vdd: 'verdade', vdd2: 'verdade', gnt: 'gente', gente: 'gente', msg: 'mensagem', msgs: 'mensagens', qlqr: 'qualquer', qq: 'qualquer', qqr: 'qualquer', tipo: 'tipo',
    pdc: 'pode crer', pdp: 'pode pa', dnv: 'de novo', denovo: 'de novo', dnovo: 'de novo', nd: 'nada', nda: 'nada', nadinha: 'nada', vo: 'vou', vamo: 'vamos', bora: 'vamos', partiu: 'vamos', vem: 'vem',
    mn: 'mano', mano: 'mano', mane: 'mano', meu: 'meu', veio: 'mano', vei: 'mano', velho: 'mano', cara: 'cara', parca: 'amigo', parcero: 'amigo', parceiro: 'amigo', truta: 'amigo', brother: 'amigo', bro: 'amigo',
    mlk: 'moleque', mlq: 'moleque', irmao: 'amigo', chefia: 'chefe', patrao: 'chefe', pessoal: 'pessoal', galera: 'galera', turma: 'galera',
    daora: 'legal', dahora: 'legal', massa: 'legal', maneiro: 'legal', maneirissimo: 'legal', irado: 'legal', brabo: 'legal', show: 'legal', top: 'legal', topzera: 'legal', topissimo: 'legal', sinistro: 'legal',
    zoado: 'ruim', zuado: 'ruim', pesado: 'pesado', lixo: 'lixo', bosta: 'lixo', merda: 'lixo', podre: 'ruim', fraco: 'ruim', ferrou: 'deu problema', fudeu: 'deu problema', lascou: 'deu problema', bugou: 'deu problema', bugado: 'com problema',
    travou: 'caiu', crashou: 'caiu', pifou: 'caiu', morreu: 'caiu', tombou: 'caiu', derrubou: 'caiu', capotou: 'caiu', offline: 'fora do ar', off: 'fora do ar', down: 'fora do ar', quebrado: 'quebrado',
    net: 'internet', wifi: 'internet', wi: 'internet', lag: 'lento', lagado: 'lento', lagou: 'lento', lerdo: 'lento', lenta: 'lento', lentidao: 'lento', pc: 'computador', maq: 'maquina', maqs: 'maquinas',
    grana: 'dinheiro', din: 'dinheiro', cash: 'dinheiro', bufunfa: 'dinheiro', dindin: 'dinheiro', pila: 'dinheiro', conta: 'conta', pagamento: 'pagamento',
    fome: 'fome', rango: 'comida', cafezinho: 'cafe', cafeh: 'cafe', rolê: 'role', role: 'role', rolezinho: 'role', zap: 'whatsapp', zapzap: 'whatsapp', whats: 'whatsapp',
    hahaha: 'k', haha: 'k', hehe: 'k', rs: 'k', rsrs: 'k', rsrsrs: 'k', kk: 'k', kkk: 'k', lol: 'k', lmao: 'k', kkj: 'k', kjk: 'k', kskk: 'k', ksks: 'k', kct: 'k',
    caramba: 'nossa', caraca: 'nossa', caraio: 'nossa', pqp: 'nossa', poxa: 'nossa', putz: 'nossa', eita: 'nossa', uau: 'nossa', wow: 'nossa', oxe: 'nossa', ixi: 'nossa', xi: 'nossa', vish: 'nossa', nossaa: 'nossa',
    foi: 'foi', ok: 'ok', okay: 'ok', okk: 'ok', blza: 'beleza', belezinha: 'beleza', suave: 'suave', tranks: 'tranquilo', tranquilao: 'tranquilo', trankilo: 'tranquilo', tranqs: 'tranquilo',
    num: 'nao', nem: 'nem', cmo: 'como', cm: 'com', cmc: 'como', pk: 'porque', xau: 'tchau', tchauzinho: 'tchau', fui: 'fui', abs: 'abraco', abc: 'abraco', bjs: 'beijo', bj: 'beijo',
    ve: 've', vee: 've', ve2: 've', pode: 'pode', pd: 'pode', podi: 'pode', consigo: 'consigo', qria: 'queria', quero: 'quero', qro: 'quero', qr: 'quer', kero: 'quero', sei: 'sei', sabe: 'sabe',
    u: 'voce', ur: 'seu', euh: 'eu', ela: 'ela', dele: 'dele', ctrl: 'ctrl', hein: 'hein', hm: 'hmm', hmm: 'hmm', hmmm: 'hmm', ah: 'ah', ahh: 'ah', ata: 'ah', uai: 'ue', ue: 'ue',
  };
  // "tudo bem" style multi-word slang that is easier to fix before splitting
  const PHRASES = [
    [/\bt[aá]\s+ligado\b/g, 'ta ligado'], [/\bde boa na lagoa\b/g, 'de boa'], [/\bfala\s+(ai|ae)\b/g, 'e ai'], [/\bsalve\b/g, 'e ai'], [/\bo\s+q\b/g, 'o que'], [/\bpra\s+q\b/g, 'para que'],
    [/\bpor\s+que\b/g, 'porque'], [/\bpor\s+qu[eê]\b/g, 'porque'], [/\bse\s+liga\b/g, 'ta ligado'],
  ];

  /* ---------- 3. typo tolerance ---------- */
  // words the intent patterns care about; an unknown word close to one of them is read as that word
  const VOCAB = [
    'servidor', 'servidores', 'problema', 'problemas', 'rede', 'switch', 'cabo', 'cabos', 'porta', 'dinheiro', 'financas', 'temperatura', 'turno', 'salario', 'ordem', 'ordens',
    'virtual', 'resolver', 'resolva', 'obrigado', 'obrigada', 'piada', 'engracado', 'terminal', 'equipe', 'trabalho', 'trabalhando', 'fazendo', 'cansado', 'cansada', 'estressado',
    'conserta', 'consertar', 'arrumar', 'incidente', 'alerta', 'falha', 'empresa', 'lucro', 'prejuizo', 'refrigeracao', 'pessoal', 'parabens', 'desculpa', 'tchau', 'entendi',
    'beleza', 'tranquilo', 'ajuda', 'preciso', 'datacenter', 'musica', 'futebol', 'cafe', 'almoco', 'intervalo', 'proximo', 'prioridade', 'caiu', 'quebrou', 'conexao', 'internet',
    'ninguem', 'qualquer', 'explica', 'detalhes', 'maquina', 'maquinas', 'computador', 'inteligente', 'burro', 'idiota', 'incompetente', 'otimo', 'excelente', 'perfeito', 'saudade',
  ];
  const VOCAB_SET = new Set(VOCAB);
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        cur[j] = v;
        if (v < best) best = v;
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // a swap of two neighbouring letters ("servidro", "probelma") counts as one slip, not two
  const swapped = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); return false; };
  const fixCache = new Map();
  function fixWord(w) {
    if (w.length < 5 || VOCAB_SET.has(w) || SLANG[w] != null || /\d/.test(w)) return w;
    if (fixCache.has(w)) return fixCache.get(w);
    const max = w.length >= 9 ? 2 : 1;
    let best = null, bd = 9, tie = false;
    for (const v of VOCAB) {
      const d = swapped(w, v) ? 1 : lev(w, v, max);
      if (d > max) continue;
      if (d < bd) { best = v; bd = d; tie = false; } else if (d === bd && v !== best) tie = true;
    }
    const r = best && !tie ? best : w;
    if (fixCache.size > 800) fixCache.clear();
    fixCache.set(w, r);
    return r;
  }

  // the whole pipeline: raw text → plain words the patterns understand
  function norm(text) {
    let s = String(text == null ? '' : text);
    for (const [re, to] of EMOJI) s = s.replace(re, to);
    s = clean(s);
    for (const [re, to] of PHRASES) s = s.replace(re, to);
    s = s.replace(/[a-z0-9]+/g, (w) => (SLANG[w] != null ? SLANG[w] : fixWord(w)));
    return s.replace(/\s+/g, ' ').trim();
  }

  /* ---------- 4. intents (first match wins; the order matters) ---------- */
  const INTENTS = [
    ['bye', /^(tchau|falou|ate (mais|logo|amanha|depois|a proxima)|fui|bom descanso|durma bem|bom fim de semana|bom final de semana|boa folga|vou nessa|vou indo|tenho que ir|preciso ir)\b/],
    ['wait', /(^| )(esta ai|ainda esta ai|alo|sumiu|esta vivo|esta (me )?ouvindo|me escuta|responde|ta dormindo|acordado)( |$)/],
    ['sorry', /(desculp|foi mal|perdao|perdoa|sinto muito|me perdoe|fui grosso|exagerei)/],
    ['insult', /(burro|idiota|inutil|incompetente|imbecil|estupido|lixo|odeio|detesto|que droga|nao serve|voce (e|esta) (ruim|horrivel|pessimo)|vai se|cala a boca|calado|ridiculo|palhaco|trouxa|otario|merda)/],
    ['compliment', /(parabens|arrasou|mandou bem|mandou muito|mandou ver|voce (e|esta) (muito |super |bem )?(bom|boa|legal|otimo|otima|incrivel|inteligente|esperto|esperta|demais|foda|craque|fera|um craque|uma fera|o melhor|a melhor|top|genial|show)|gosto (muito )?de voce|gostei de voce|orgulho|voce e demais|melhor funcionario|melhor da equipe|tamo junto|bom trabalho|belo trabalho|excelente trabalho|otimo trabalho|trabalho (incrivel|perfeito)|boa (jogada|equipe))/],
    ['thanks', /(valeu|obrigad|agradec|show de bola|perfeito|excelente|salvou|me salvou|ajudou muito|ajudou bastante)/],
    ['isbot', /(voce (e|esta) (um |uma )?(robo|bot|ia|inteligencia artificial|maquina|programa|de verdade|real|humano|pessoa|gente|vivo|viva)|e (um )?(robo|bot|ia)\b|e gente de verdade|tem alguem ai|quem programou|quem te (fez|criou|programou)|voce pensa|voce tem sentimento|voce sente)/],
    ['who', /(qual (e )?(o )?seu nome|como (voce )?(se chama|chama)|seu nome|quem (e )?voce|quem e vc|se apresenta|apresente-se|fala de voce|fale de voce|me conta de voce|conta sobre voce|sobre voce)/],
    ['personal', /(quantos anos|sua idade|que idade|onde (voce )?(mora|vive|nasceu)|de onde (voce )?(e|vem)|sua familia|tem (filho|irmao|irma|pet|cachorro|gato)|e casad|e solteir|tem (namorad|esposa|marido)|tem (hobby|passatempo)|o que (voce )?(faz|gosta de fazer) (nas folgas|no tempo livre|nas horas vagas|fora do trabalho)|tempo livre|nas horas vagas)/],
    ['jobfeel', /(gosta (de |do |da )?(trabalh|aqui|empresa|chefe|emprego|datacenter|equipe|time|seu trabalho|sua funcao)|esta feliz|feliz (aqui|com)|satisfeit|motivad|quer sair|pensa em (sair|pedir)|pedir demissao|esta contente|clima (aqui|da equipe|do time)|ambiente (aqui|de trabalho))/],
    ['abilities', /(o que (voce )?(sabe|consegue|pode|entende)|sobre o que|do que (voce )?(entende|fala)|que (comandos|perguntas|assuntos)|posso (te )?perguntar|como (eu )?(falo|converso|uso|te uso)|me ajuda a (usar|entender)|como funciona (isso|o chat|a conversa)|lista de (comandos|assuntos)|\bajuda\b$|^(ajuda|help|menu|comandos|\?)$)/],
    ['feelUser', /(^| )(estou|me sinto|to|tou|ando|fiquei|estava) (\w+ )?(muito |bem |meio |super |tao |um pouco |um pouquinho )?(cansad|estressad|exaust|esgotad|com sono|sonolent|desanimad|triste|mal\b|ansios|preocupad|perdid|nervos|de saco cheio|sobrecarregad|sem energia|sem animo)/],
    ['bored', /(estou|to|tou|ando) (muito |meio |super )?(entediad|sem nada|de bobeira|com tedio)|que tedio|to sem o que fazer|nada pra fazer|nada para fazer|me entreten|me distrai|conversa comigo|vamos conversar|bora conversar|puxa assunto/],
    ['feelBot', /(voce (esta|ta|anda) (\w+ )?(cansad|estressad|bem|mal|triste|feliz|animad|sobrecarregad|com sono|com fome|nervos|ansios|desanimad))/],
    ['time', /(que horas (sao|e)|horas sao|que hora e|hora atual|que dia (e|eh) hoje|qual (e )?o dia|data de hoje)/],
    ['smalltalk', /(tudo bem|tudo certo|tudo tranquilo|tudo joia|tudo firme|tudo em paz|como vai( voce)?[ ]*$|como voce (esta|vai)|como (esta|vai)( voce)?[ ]*$|como (e que )?esta voce|de boa|suave|firmeza|como foi o dia|e voce\b|e com voce|como (esta|vai) o (dia|trabalho|turno)|ta ligado|novidade|alguma novidade|o que (tem|ha) de novo|e as novidades|na paz|tranquilo\?|beleza\?)/],
    ['greet', /^(oi|ola|e ai|bom dia|boa tarde|boa noite|hey|hello|hi|opa|fala|oba|bem vindo|boa madrugada|ei|eae)\b/],
    ['shift', /(turno|escala|plantao|folga|horario|(que horas|quando) (voce )?(sai|entra|chega|vai embora)|hora extra)/],
    ['salary', /(salario|pagamento|aumento|folha|quanto (voce )?(ganha|recebe)|promocao|promover|demitir|demissao|bonus|ferias)/],
    ['weather', /(clima|previsao do tempo|vai chover|esta chovendo|chuva|tempo la fora|esta frio la|esta calor la|sol la fora|faz sol)/],
    ['workplace', /(mesa|bancada|estrutura|posto de trabalho|seu setor|sua sala|precisa de (algo|alguma coisa)|falta (algo|alguma coisa)|condic|cadeira|monitor novo|equipamento seu)/],
    ['coffee', /(cafe|agua|lanche|almoc|comer|fome|pausa|intervalo|descans|janta|jantar|cerveja|pizza|comida|doce|salgado|sorvete|padaria)/],
    ['joke', /(piada|engracad|me faz rir|conta uma|me faz sorrir|me anima|tem alguma graca|diz algo engracado|fala algo engracado)/],
    ['hobby', /(futebol|jogo de ontem|flamengo|corinthians|palmeiras|sao paulo fc|santos|vasco|gremio|cruzeiro|botafogo|copa do mundo|brasileirao|filme|serie|netflix|anime|musica|banda|cantor|cantora|show de|spotify|playlist|videogame|\bgame\b|jogos|jogar|playstation|xbox|minecraft|fortnite|valorant|lol\b|cs2|gta|livro|ler\b|academia|treino|corrida|viagem|viajar|praia|fim de semana|final de semana|churrasco|festa|role\b|hobby|time do coracao|torce)/],
    ['laugh', /(^| )k( |$)|(^| )(ha)+( |$)|^(he)+$|engracado isso|essa foi boa|me matou|morri/],
    ['no', /^(nao|nope|negativo|nunca|de jeito nenhum|deixa|deixa pra la|esquece|melhor nao|agora nao|depois|nao quero|nao precisa|dispenso)\b/],
    ['yes', /^(sim|claro|com certeza|pode sim|pode|quero|manda|manda ver|isso|isso mesmo|exato|exatamente|positivo|afirmativo|vamos|fechou|combinado|pode ser|uhum|por favor)\b/],
    ['confirm', /^(ok|okay|beleza|certo|entendi|fechou|fechado|top|massa|boa|ta bom|legal|tendi|saquei|perfeito|ahh?|ah|hmm|ue)\b/],
    ['why', /^(porque|como assim|explica|me explica|explique|detalha|detalhe|mais detalhes|conta mais|fala mais|quer dizer|nao entendi|nao entendo|nao peguei|repete|de novo|dnv|fala de novo|pode repetir|como assim)/],
    ['more', /^(e ai|e entao|e o resto|e os outros|so isso|mais alguma|algo mais|mais algo|continua|prossiga|segue|e depois|e agora|e mais|tem mais)/],
    ['orders', /(ordem|ordens|ordem de servico|chamado tecnico)/],
    ['vms', /(\bvms?\b|virtual|proxmox|hypervisor|maquina virtual)/],
    ['next', /(proximo passo|proximo|o que (eu )?(devo|faco|fazer|posso fazer)|dica|ajuda|sugest|prioridade|por onde|por onde comeco|como comecar|como eu comeco|e agora|tutorial|me guia|me orienta|o que falta|o que precisa)/],
    ['fix', /(resolv|consert|arrum|corrig|da um jeito|cuida disso|conserta isso|faz funcionar|bota pra funcionar|levanta|sobe o|reinicia|reboot|reiniciar)/],
    ['where', /(\bonde\b|mostra|me leva|aponta|qual (rack|sala)|cade (o|a))/],
    ['problems', /(problema|erro|falha|incidente|alerta|errado|quebr|caiu|fora do ar|deu ruim|deu problema|com problema|nao funciona|nao esta funcionando|nao responde|parou|travado|bug|tem algo estranho|alguma coisa estranha|esta estranho|panico|socorro|urgente|emergencia|apagao|incendio)/],
    ['money', /(dinheiro|financ|prejuiz|custo|lucro|receita|empresa|caixa|saldo|credito|datacoin|gold|faturamento|orcamento|estamos no azul|no vermelho|gastar|gasto|investir|comprar|quanto temos|quanto tem)/],
    ['network', /(rede|switch|cabo|porta|link|ping|conex|uplink|internet|vlan|ip\b|latencia|lento|roteador|firewall|gateway|dns|banda)/],
    ['servers', /(servidor|server|srv|host|maquina|computador|hardware|rack|disco|memoria|cpu|processador|uptime)/],
    ['temp', /(temperatura|quente|calor|refrigera|\bar\b|crac|esfriar|resfria|superaquec|ventila|climatiza)/],
    ['doing', /(fazendo|tarefa|ocupad|trabalhando|faz agora|esta fazendo|no que (esta|voce esta) trabalhando|em que (esta|voce esta) trabalhando|o que rola|o que esta rolando|o que esta acontecendo|o que ta rolando|status)/],
    ['progress', /(datacenter|conclu|recompensa|meta|progresso|marco|objetivo|missao)/],
    ['self', /(nivel|experiencia|habilidade|aprend|estrela|evolu|skill|xp\b|especialidade|sua funcao|seu cargo|qual (e )?(a )?sua area)/],
  ];
  const WORDS = (t) => (t ? t.split(' ').length : 0);

  function detect1(t, raw) {
    t = t.replace(/[?!.,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    let id = 'unknown';
    for (const [name, re] of INTENTS) if (re.test(t)) { id = name; break; }
    // short follow-ups only: "porque?" is a follow-up, "porque o servidor caiu?" is a real question
    if ((id === 'why' || id === 'more') && WORDS(t) > 4) {
      const rest = t.replace(INTENTS.find((x) => x[0] === id)[1], '').trim();
      return rest.length > 3 ? detect1(rest, raw) : id;
    }
    // "beleza?" / "tranquilo?" / "ok?" as a question is "how are you", not an agreement
    if (id === 'confirm' && raw && /\?\s*$/.test(raw) && WORDS(t) <= 2 && /(beleza|tranquilo|suave|firmeza|boa|legal)/.test(t)) return 'smalltalk';
    return id;
  }
  // "e aí, td certo? qnd vc sai?" → the real question (shift), answered after a quick "tudo certo!"
  const CHIT = /\b(oi|ola|e ai|bom dia|boa tarde|boa noite|opa|fala|tudo bem|tudo certo|tudo tranquilo|tudo joia|como vai|de boa|suave|beleza|ta ligado|voce esta de boa|voce esta bem|mano|amigo|cara|chefe|pessoal|galera|gente)\b[\s,!?.]*/g;
  function detectFull(text) {
    const raw = String(text == null ? '' : text);
    const t = norm(raw);
    const first = t ? detect1(t, raw) : 'unknown';
    if (first !== 'smalltalk' && first !== 'greet') return { intent: first, chit: false, text: t };
    const rest = t.replace(CHIT, ' ').replace(/\b(voce|tambem|e|eu)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const q = rest.length > 3 ? detect1(rest, raw) : 'unknown';
    return q !== 'unknown' && q !== 'smalltalk' && q !== 'greet' && q !== 'confirm' && q !== 'yes' ? { intent: q, chit: first, text: t } : { intent: first, chit: false, text: t };
  }

  /* ---------- 5. several questions in one message ---------- */
  // "como estão os servidores e a rede?" → ['servers', 'network']  (at most 2, in the order they were asked)
  function detectAll(text) {
    const t = norm(text);
    const parts = t.split(/\s*(?:[?!.;]+|\be tambem\b|\be\b|\btambem\b|\bmais\b|,)\s*/).map((x) => x.trim()).filter((x) => x.length > 3);
    const out = [];
    for (const p of parts) {
      const id = detect1(p, '');
      if (id !== 'unknown' && out.indexOf(id) < 0 && ['servers', 'network', 'problems', 'money', 'temp', 'orders', 'vms', 'doing', 'shift', 'progress'].indexOf(id) >= 0) out.push(id);
    }
    return out.length > 1 ? out.slice(0, 2) : [];
  }

  // small, stable "facts" about someone from their name: same answer every time you ask
  function hash(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

  DL.Brain = { clean, norm, detect: (t) => detectFull(t).intent, detectFull, detectAll, hash, lev, INTENTS };
  DL.normSlang = norm;
  DL.talkDetect = detectFull;
})();
