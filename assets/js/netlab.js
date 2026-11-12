/* DataLab — Laboratório de Redes. A small network simulator with its own look: place PCs, servers,
   switches and routers, connect them with cables, configure IP / mask / gateway / DNS, interfaces,
   VLANs and static routes, then test with ping, ipconfig / ip addr and tracert / traceroute.
   Wrong settings are refused with "Configuração inválida": what is wrong, why, a short explanation
   and how to fix it. Failed pings explain where the packet stopped. Five challenges teach by doing:
   the lab checks the result, it never fixes the network for the player.
   Model: layer 2 = cables + switch ports (access VLAN or trunk); layer 3 = hosts with one interface,
   routers with several, connected networks + static routes. A ping must go AND come back. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const KEY = 'datalab.netlab.v1';

  /* ------------------------------------------------------------------ */
  /* IPv4 helpers                                                        */
  /* ------------------------------------------------------------------ */
  function ipToInt(s) {
    const m = String(s || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const p = m.slice(1).map(Number);
    if (p.some((x) => x > 255)) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }
  const intToIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const prefixToMask = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
  // accepts 255.255.255.0, /24 or 24
  function maskToInt(s) {
    s = String(s || '').trim();
    const m = s.match(/^\/?(\d{1,2})$/);
    if (m) { const p = +m[1]; return p >= 0 && p <= 32 ? prefixToMask(p) : null; }
    return ipToInt(s);
  }
  const maskOk = (m) => m != null && ((~m >>> 0) & ((~m >>> 0) + 1)) === 0; // ones then zeros
  const prefixOf = (m) => { let n = 0; for (let i = 31; i >= 0; i--) { if ((m >>> i) & 1) n++; else break; } return n; };
  const netOf = (ip, m) => (ip & m) >>> 0;
  const bcastOf = (ip, m) => ((ip & m) | (~m >>> 0)) >>> 0;
  const cidr = (ip, m) => intToIp(netOf(ip, m)) + '/' + prefixOf(m);

  /* ------------------------------------------------------------------ */
  /* Devices                                                             */
  /* ------------------------------------------------------------------ */
  const TYPES = {
    pc: { name: 'PC', label: 'PC' }, server: { name: 'Servidor', label: 'Servidor' },
    switch: { name: 'SW', label: 'Switch' }, router: { name: 'R', label: 'Roteador' },
  };
  const isHost = (d) => d.type === 'pc' || d.type === 'server';

  function makeDev(L, type, x, y, o) {
    o = o || {};
    const n = L.devs.filter((d) => d.type === type).length + 1;
    const d = { id: 'd' + (L.seq++), type, name: o.name || TYPES[type].name + n, x, y, gw: o.gw || '', dns: o.dns || '', routes: [], dnsService: !!o.dnsService };
    if (isHost(d)) d.ifaces = [{ name: 'eth0', ip: o.ip || '', mask: o.mask || '', up: true }];
    else if (type === 'switch') { d.ifaces = Array.from({ length: 8 }, (_, i) => ({ name: 'Fa0/' + (i + 1), mode: 'access', vlan: 1, up: true })); d.vlans = [{ id: 1, name: 'default' }]; }
    else d.ifaces = Array.from({ length: 3 }, (_, i) => ({ name: 'G0/' + i, ip: '', mask: '', up: false }));
    L.devs.push(d);
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* Validation: "Configuração inválida" with what / why / explain / tip */
  /* ------------------------------------------------------------------ */
  const bad = (what, why, explain, tip) => ({ what, why, explain, tip });
  const warnOf = (what, why, explain, tip) => ({ what, why, explain, tip, warn: true });

  function checkIp(label, s) {
    if (ipToInt(s) != null) return null;
    const parts = String(s).split('.');
    if (parts.length !== 4) return bad(label + ' "' + s + '" não é um IPv4 válido', 'Um IPv4 tem exatamente 4 números separados por ponto.', 'O endereço identifica o equipamento na rede, no formato a.b.c.d.', 'Escreva algo como 192.168.1.10.');
    return bad(label + ' "' + s + '" tem um número fora do limite', 'Cada um dos 4 números (octetos) vai de 0 a 255 — são 8 bits cada.', 'Um IPv4 tem 32 bits divididos em 4 octetos de 8 bits (0 a 255).', 'Troque o número acima de 255. Ex.: 192.168.1.10.');
  }
  function checkMask(s) {
    const m = maskToInt(s);
    if (m == null) return bad('Máscara "' + s + '" inválida', 'A máscara precisa ser no formato 255.255.255.0 ou /24.', 'A máscara separa a parte do IP que é a rede da parte que é o equipamento.', 'Para uma rede pequena use 255.255.255.0 (/24).');
    if (!maskOk(m)) return bad('Máscara ' + s + ' não existe', 'Numa máscara, todos os bits 1 vêm antes dos bits 0. ' + s + ' mistura os dois.', 'Máscaras válidas: 255.0.0.0 (/8), 255.255.0.0 (/16), 255.255.255.0 (/24), 255.255.255.128 (/25)…', 'Use 255.255.255.0 para a maioria dos laboratórios.');
    if (prefixOf(m) < 8 || prefixOf(m) > 30) return bad('Máscara /' + prefixOf(m) + ' fora do comum para um equipamento', prefixOf(m) > 30 ? 'Com /31 ou /32 não sobram endereços para equipamentos e broadcast.' : 'Uma rede maior que /8 não faz sentido num laboratório.', 'Quanto maior o prefixo, menor a rede: /24 tem 254 endereços úteis.', 'Use entre /8 e /30 — normalmente /24.');
    return null;
  }

  // a host or router interface address; returns [errors]
  function checkAddress(L, dev, ifc, ipS, maskS) {
    const errs = [];
    if (!ipS && !maskS) return errs;
    if (!ipS) return [bad('Falta o IP', 'Você preencheu a máscara mas não o endereço.', 'IP e máscara andam juntos: um diz quem é o equipamento, o outro qual é a rede.', 'Preencha o IP, ex.: 192.168.1.10.')];
    const e1 = checkIp('IP', ipS);
    if (e1) return [e1];
    if (!maskS) return [bad('Falta a máscara', 'Sem máscara o equipamento não sabe qual é a sua rede.', 'A máscara define quais IPs estão na mesma rede (alcançáveis direto) e quais precisam do gateway.', 'Use 255.255.255.0 (/24).')];
    const e2 = checkMask(maskS);
    if (e2) return [e2];
    const ip = ipToInt(ipS), m = maskToInt(maskS);
    const first = ip >>> 24;
    if (first === 127) return [bad(ipS + ' é um endereço de loopback', 'A faixa 127.0.0.0/8 é reservada para o próprio equipamento falar consigo mesmo.', 'Pacotes para 127.x nunca saem da placa de rede.', 'Use uma faixa privada: 192.168.x.x, 10.x.x.x ou 172.16–31.x.x.')];
    if (first === 0 || first >= 224) return [bad(ipS + ' é de uma faixa reservada', first >= 224 ? '224 a 239 é multicast e acima disso é reservado.' : '0.x.x.x significa "esta rede" e não vai em equipamentos.', 'Nem todo IPv4 pode ser usado num computador.', 'Use 192.168.1.10, por exemplo.')];
    if (ip === netOf(ip, m)) return [bad(ipS + ' é o endereço da própria rede', 'Com a máscara /' + prefixOf(m) + ', o primeiro endereço (' + intToIp(netOf(ip, m)) + ') identifica a rede inteira e não pode ir num equipamento.', 'Toda rede reserva o primeiro endereço (rede) e o último (broadcast).', 'Use de ' + intToIp(netOf(ip, m) + 1) + ' até ' + intToIp(bcastOf(ip, m) - 1) + '.')];
    if (ip === bcastOf(ip, m)) return [bad(ipS + ' é o endereço de broadcast', 'O último endereço da rede (' + ipS + ') é usado para falar com todos ao mesmo tempo.', 'Toda rede reserva o primeiro endereço (rede) e o último (broadcast).', 'Use de ' + intToIp(netOf(ip, m) + 1) + ' até ' + intToIp(bcastOf(ip, m) - 1) + '.')];
    if (dev.type === 'router') {
      for (const o of dev.ifaces) {
        if (o === ifc || !o.ip || !o.mask) continue;
        const oi = ipToInt(o.ip), om = maskToInt(o.mask);
        const wide = prefixOf(m) < prefixOf(om) ? m : om; // the bigger of the two networks
        if (netOf(ip, wide) === netOf(oi, wide)) {
          return [bad('A ' + ifc.name + ' ficaria na mesma rede da ' + o.name + ' (' + cidr(oi, om) + ')', 'Cada interface do roteador liga uma rede diferente. Duas interfaces na mesma rede confundem a decisão de por onde mandar o pacote.', 'O roteador conecta redes: uma rede por interface.', 'Use outra rede nesta interface, ex.: ' + intToIp(((netOf(oi, om) + 256) >>> 0) + 1) + ' /24.')];
        }
      }
    }
    const dup = L.devs.find((d) => d.ifaces.some((x) => x !== ifc && x.ip === ipS));
    if (dup) errs.push(warnOf('Conflito de IP: ' + ipS + ' já está no ' + dup.name, 'Dois equipamentos com o mesmo IP fazem as respostas irem para o lugar errado.', 'Cada IP deve ser único dentro da rede.', 'Escolha outro final, ex.: ' + intToIp(ip + 1) + '.'));
    return errs;
  }

  function checkGateway(ifc, gwS) {
    if (!gwS) return null;
    const e = checkIp('Gateway', gwS);
    if (e) return e;
    if (!ifc.ip || !ifc.mask) return bad('Gateway sem IP no equipamento', 'O gateway é usado para sair da rede do equipamento — e ela ainda não foi definida.', 'Primeiro IP e máscara, depois o gateway.', 'Preencha IP e máscara antes do gateway.');
    const ip = ipToInt(ifc.ip), m = maskToInt(ifc.mask), g = ipToInt(gwS);
    if (g === ip) return bad('O gateway é o próprio IP do equipamento', 'O gateway é OUTRO equipamento (o roteador) que leva os pacotes para fora da rede.', 'Gateway padrão = porta de saída da rede local.', 'Use o IP da interface do roteador nesta rede, normalmente o .1 (' + intToIp(netOf(ip, m) + 1) + ').');
    if (netOf(g, m) !== netOf(ip, m)) return bad('O gateway ' + gwS + ' está fora da rede ' + cidr(ip, m), 'O equipamento só fala diretamente com quem está na mesma rede. Um gateway fora dela nunca recebe os pacotes.', 'Gateway = endereço do roteador DENTRO da rede local.', 'Use um IP de ' + cidr(ip, m) + ', ex.: ' + intToIp(netOf(ip, m) + 1) + '.');
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */
  function linkAt(L, d, i) { return L.links.find((l) => (l.a.d === d.id && l.a.i === i) || (l.b.d === d.id && l.b.i === i)); }
  const devOf = (L, id) => L.devs.find((d) => d.id === id);
  function peerOf(L, d, i) {
    const l = linkAt(L, d, i);
    if (!l) return null;
    const o = l.a.d === d.id && l.a.i === i ? l.b : l.a;
    return { d: devOf(L, o.d), i: o.i };
  }

  // Layer 2: every host / router interface reachable from (d, i) through cables and switches
  function domain(L, d, i) {
    const out = [], seen = new Set();
    const q = [];
    const start = peerOf(L, d, i);
    if (start) q.push({ d: start.d, i: start.i, tag: null });
    while (q.length) {
      const c = q.shift(), k = c.d.id + ':' + c.i + ':' + c.tag;
      if (seen.has(k)) continue;
      seen.add(k);
      const p = c.d.ifaces[c.i];
      if (c.d.type !== 'switch') {
        // hosts and routers take untagged frames (or the native VLAN of a trunk)
        if ((c.tag == null || c.tag === 1) && p.up) out.push({ d: c.d, i: c.i });
        continue;
      }
      if (!p.up) continue;
      let v;
      if (p.mode === 'trunk') v = c.tag == null ? 1 : c.tag;
      else { if (c.tag != null && c.tag !== p.vlan) continue; v = p.vlan; }
      c.d.ifaces.forEach((q2, j) => {
        if (j === c.i || !q2.up) return;
        if (q2.mode === 'access' && q2.vlan !== v) return;
        const pr = peerOf(L, c.d, j);
        if (pr) q.push({ d: pr.d, i: pr.i, tag: q2.mode === 'trunk' ? v : null });
      });
    }
    return out.filter((x) => !(x.d === d && x.i === i));
  }

  const conf = (ifc) => ifc.ip && ifc.mask && ipToInt(ifc.ip) != null && maskOk(maskToInt(ifc.mask));
  const ownsIp = (d, ip) => d.ifaces.some((x) => x.up && conf(x) && ipToInt(x.ip) === ip);

  // Who has IP `ip` somewhere in the lab (used to explain failures)
  function whoHas(L, ip) { for (const d of L.devs) for (let i = 0; i < d.ifaces.length; i++) if (conf(d.ifaces[i]) && ipToInt(d.ifaces[i].ip) === ip) return { d, i }; return null; }

  // Why (d,i) cannot see the owner of `ip` at layer 2 — a short, specific reason
  function l2Why(L, d, i, ip) {
    const w = whoHas(L, ip);
    if (!w) return { code: 'noone', text: 'Nenhum equipamento do laboratório tem o IP ' + intToIp(ip) + '.' };
    const wi = w.d.ifaces[w.i];
    if (w.d.type === 'router' && !wi.up) return { code: 'down', text: 'A interface ' + wi.name + ' do ' + w.d.name + ' (' + intToIp(ip) + ') está desligada (shutdown).', tip: 'Selecione o ' + w.d.name + ' e ligue a ' + wi.name + ' (no shutdown).' };
    if (!linkAt(L, w.d, w.i)) return { code: 'nocable', text: 'O ' + w.d.name + ' (' + intToIp(ip) + ') está sem cabo na ' + wi.name + '.', tip: 'Ligue um cabo nele com a ferramenta Cabo.' };
    if (!linkAt(L, d, i)) return { code: 'nocable', text: 'O ' + d.name + ' está sem cabo na ' + d.ifaces[i].name + '.', tip: 'Ligue um cabo com a ferramenta Cabo.' };
    // same switch, different VLAN?
    const vl = (dd, ii) => { const p = peerOf(L, dd, ii); return p && p.d.type === 'switch' ? p.d.ifaces[p.i].vlan : null; };
    const va = vl(d, i), vb = vl(w.d, w.i);
    if (va != null && vb != null && va !== vb) return { code: 'vlan', text: 'O ' + d.name + ' está na VLAN ' + va + ' e o ' + w.d.name + ' na VLAN ' + vb + '. VLANs separam a rede mesmo dentro do mesmo switch.', tip: 'Coloque as duas portas na mesma VLAN — ou use um roteador para ligar as VLANs.' };
    return { code: 'path', text: 'Não há caminho de cabos/switches entre o ' + d.name + ' e o ' + w.d.name + ' (' + intToIp(ip) + ').', tip: 'Confira cabos, portas desligadas e VLANs no caminho.' };
  }

  // One direction: from device `d` to IP `dst`. Returns { ok, dest, hops:[{dev, ip}], fail:{code,text,tip,at} }
  function forward(L, d, dst) {
    const hops = [];
    let cur = d;
    for (let ttl = 0; ttl < 10; ttl++) {
      if (ownsIp(cur, dst)) return { ok: true, dest: cur, hops };
      let egress = -1, next = null;
      if (isHost(cur)) {
        const ifc = cur.ifaces[0];
        if (!conf(ifc)) return { ok: false, hops, fail: { code: 'noip', at: cur, text: 'O ' + cur.name + ' não tem IP e máscara configurados. Sem IP ele não consegue montar o pacote.', tip: 'Selecione o ' + cur.name + ' e preencha IP e máscara.' } };
        if (!linkAt(L, cur, 0)) return { ok: false, hops, fail: { code: 'nocable', at: cur, text: 'A placa de rede (eth0) do ' + cur.name + ' está sem cabo.', tip: 'Use a ferramenta Cabo para ligá-lo a um switch ou outro equipamento.' } };
        const ip = ipToInt(ifc.ip), m = maskToInt(ifc.mask);
        egress = 0;
        if (netOf(dst, m) === netOf(ip, m)) next = dst;
        else {
          if (!cur.gw) return { ok: false, hops, fail: { code: 'nogw', at: cur, text: intToIp(dst) + ' está em outra rede e o ' + cur.name + ' não tem gateway. Para sair da própria rede (' + cidr(ip, m) + '), o pacote precisa ir para o gateway — o roteador.', tip: 'Configure o gateway do ' + cur.name + ' com o IP do roteador nesta rede (ex.: ' + intToIp(netOf(ip, m) + 1) + ').' } };
          next = ipToInt(cur.gw);
        }
      } else if (cur.type === 'router') {
        cur.ifaces.forEach((x, j) => { if (egress < 0 && x.up && conf(x) && netOf(dst, maskToInt(x.mask)) === netOf(ipToInt(x.ip), maskToInt(x.mask))) { egress = j; next = dst; } });
        if (egress < 0) {
          const r = cur.routes.filter((rt) => netOf(dst, maskToInt(rt.mask)) === ipToInt(rt.net)).sort((a, b) => prefixOf(maskToInt(b.mask)) - prefixOf(maskToInt(a.mask)))[0];
          if (!r) return { ok: false, hops, fail: { code: 'noroute', at: cur, text: 'O ' + cur.name + ' não conhece o caminho para ' + intToIp(dst) + ': não tem interface ligada nessa rede nem rota para ela.', tip: 'Ligue/configure a interface dessa rede, ou adicione uma rota estática (rede de destino + próximo salto).' } };
          const via = ipToInt(r.via);
          cur.ifaces.forEach((x, j) => { if (egress < 0 && x.up && conf(x) && netOf(via, maskToInt(x.mask)) === netOf(ipToInt(x.ip), maskToInt(x.mask))) egress = j; });
          if (egress < 0) return { ok: false, hops, fail: { code: 'noroute', at: cur, text: 'A rota do ' + cur.name + ' aponta para ' + r.via + ', mas nenhuma interface ligada está nessa rede.', tip: 'Confira o próximo salto da rota e se a interface está ligada.' } };
          next = via;
        }
      } else return { ok: false, hops, fail: { code: 'switch', at: cur, text: 'Switches deste laboratório não têm IP: o teste parte de um PC, servidor ou roteador.' } };
      const dom = domain(L, cur, egress);
      const hit = dom.find((x) => conf(x.d.ifaces[x.i]) && ipToInt(x.d.ifaces[x.i].ip) === next);
      if (!hit) {
        const why = l2Why(L, cur, egress, next);
        const isGw = next !== dst;
        return { ok: false, hops, fail: { code: isGw ? 'gw' : 'unreach', at: cur, text: (isGw ? 'O ' + cur.name + ' mandou o pacote para o gateway/próximo salto ' + intToIp(next) + ', mas ele não respondeu na rede local. ' : 'O ' + cur.name + ' procurou ' + intToIp(next) + ' na rede local e ninguém respondeu. ') + why.text, tip: why.tip || (isGw ? 'Confira se o gateway é mesmo o IP da interface do roteador e se ela está ligada.' : 'Confira se o IP de destino está certo e se os dois estão na mesma rede/VLAN.') } };
      }
      if (hit.d.type === 'router' && !ownsIp(hit.d, dst)) {
        hops.push({ dev: hit.d, ip: intToIp(next) });
        cur = hit.d;
        continue;
      }
      if (ownsIp(hit.d, dst)) { if (hit.d.type === 'router') hops.push({ dev: hit.d, ip: intToIp(dst) }); return { ok: true, dest: hit.d, hops }; }
      return { ok: false, hops, fail: { code: 'notrouter', at: cur, text: 'O gateway do ' + cur.name + ' (' + intToIp(next) + ') é o ' + hit.d.name + ', que não é um roteador — ele não encaminha pacotes para outras redes.', tip: 'Use como gateway o IP de uma interface do roteador.' } };
    }
    return { ok: false, hops, fail: { code: 'loop', at: cur, text: 'O pacote ficou dando voltas entre roteadores até o TTL acabar (loop de roteamento).', tip: 'Confira as rotas estáticas: elas não podem apontar uma para a outra.' } };
  }

  // name → IP through the configured DNS server
  function resolve(L, src, name) {
    const ip = ipToInt(name);
    if (ip != null) return { ip };
    if (!src.dns) return { err: 'O ' + src.name + ' não tem servidor DNS configurado, então não sabe traduzir "' + name + '" em IP.', tip: 'Configure o DNS do ' + src.name + ' com o IP do servidor que tem o serviço DNS — ou use o IP direto.' };
    const ds = L.devs.find((d) => d.type === 'server' && d.dnsService && d.ifaces[0].ip === src.dns);
    if (!ds) return { err: 'O DNS configurado (' + src.dns + ') não é um servidor com serviço DNS ligado.', tip: 'Ligue "Serviço DNS" num servidor e use o IP dele como DNS.' };
    if (!forward(L, src, ipToInt(src.dns)).ok) return { err: 'O servidor DNS ' + src.dns + ' não está alcançável a partir do ' + src.name + '.', tip: 'Faça o ping para o IP do DNS funcionar primeiro.' };
    const t = L.devs.find((d) => d.name.toLowerCase() === String(name).toLowerCase() || (d.name.toLowerCase() + '.lab') === String(name).toLowerCase());
    if (!t || !t.ifaces.some(conf)) return { err: 'O DNS não encontrou o nome "' + name + '".', tip: 'Os nomes do laboratório são os nomes dos equipamentos (ex.: Servidor1 ou servidor1.lab).' };
    return { ip: ipToInt(t.ifaces.find(conf).ip), name };
  }

  // the whole ping: there and back
  function ping(L, src, target) {
    const r = resolve(L, src, target);
    if (r.err) return { ok: false, dns: true, fail: { code: 'dns', text: r.err, tip: r.tip } };
    const go = forward(L, src, r.ip);
    if (!go.ok) return { ok: false, ip: r.ip, go, fail: go.fail };
    const srcIp = ipToInt(src.ifaces.find(conf).ip);
    const back = forward(L, go.dest, srcIp);
    if (!back.ok) return { ok: false, ip: r.ip, go, back, reply: true, fail: { code: 'reply', at: go.dest, text: 'O pacote chegou ao ' + go.dest.name + ', mas a resposta não consegue voltar: ' + back.fail.text, tip: back.fail.tip } };
    return { ok: true, ip: r.ip, go, back, name: r.name };
  }

  /* ------------------------------------------------------------------ */
  /* Challenges                                                          */
  /* ------------------------------------------------------------------ */
  const byName = (L, n) => L.devs.find((d) => d.name === n);
  const connected = (L, a, b) => a && b && L.links.some((l) => (l.a.d === a.id && l.b.d === b.id) || (l.a.d === b.id && l.b.d === a.id));
  const sameNet = (a, b) => a && b && conf(a.ifaces[0]) && conf(b.ifaces[0]) && a.ifaces[0].mask === b.ifaces[0].mask && netOf(ipToInt(a.ifaces[0].ip), maskToInt(a.ifaces[0].mask)) === netOf(ipToInt(b.ifaces[0].ip), maskToInt(b.ifaces[0].mask));
  const pinged = (L, from, toDev, ok) => from && toDev && L.events.some((e) => e.src === from.id && e.dst === toDev.id && e.ok === (ok !== false));
  const reach = (L, a, b) => a && b && b.ifaces.some(conf) && ping(L, a, b.ifaces.find(conf).ip).ok;
  const viaSwitch = (L, d, sw) => d && sw && connected(L, d, sw);

  const CHALLENGES = [
    {
      n: '01', title: 'Conecte dois computadores',
      brief: 'Dois PCs, nenhum cabo e nenhum IP. Faça os dois conversarem.',
      setup(L) { makeDev(L, 'pc', 260, 250); makeDev(L, 'pc', 640, 250); },
      goals: [
        ['Ligue um cabo entre o PC1 e o PC2', (L) => connected(L, byName(L, 'PC1'), byName(L, 'PC2'))],
        ['Dê aos dois um IP da mesma rede (mesma máscara)', (L) => sameNet(byName(L, 'PC1'), byName(L, 'PC2')) && byName(L, 'PC1').ifaces[0].ip !== byName(L, 'PC2').ifaces[0].ip],
        ['No console do PC1, faça um ping para o PC2', (L) => pinged(L, byName(L, 'PC1'), byName(L, 'PC2'))],
      ],
      hints: ['Escolha a ferramenta Cabo, clique no PC1 e depois no PC2.', 'Selecione o PC1 → Configuração: IP 192.168.1.10, máscara 255.255.255.0. No PC2 use 192.168.1.20.', 'Selecione o PC1 e, no console embaixo, digite: ping 192.168.1.20'],
      learn: 'Dois equipamentos na mesma rede (mesmo prefixo e máscara) conversam direto, sem roteador.',
    },
    {
      n: '02', title: 'Configure uma rede local',
      brief: 'Três PCs e um servidor precisam ficar na mesma rede, ligados por um switch.',
      setup(L) { makeDev(L, 'switch', 450, 250); makeDev(L, 'pc', 200, 120); makeDev(L, 'pc', 200, 380); makeDev(L, 'pc', 700, 380); makeDev(L, 'server', 700, 120); },
      goals: [
        ['Ligue os 3 PCs e o Servidor1 ao SW1', (L) => ['PC1', 'PC2', 'PC3', 'Servidor1'].every((n) => viaSwitch(L, byName(L, n), byName(L, 'SW1')))],
        ['Todos na rede 192.168.10.0/24, com IPs diferentes', (L) => { const ds = ['PC1', 'PC2', 'PC3', 'Servidor1'].map((n) => byName(L, n)); return ds.every((d) => conf(d.ifaces[0]) && cidr(ipToInt(d.ifaces[0].ip), maskToInt(d.ifaces[0].mask)) === '192.168.10.0/24') && new Set(ds.map((d) => d.ifaces[0].ip)).size === 4; }],
        ['Todos os PCs alcançam o Servidor1', (L) => ['PC1', 'PC2', 'PC3'].every((n) => reach(L, byName(L, n), byName(L, 'Servidor1')))],
        ['Teste: ping de um PC para o Servidor1', (L) => ['PC1', 'PC2', 'PC3'].some((n) => pinged(L, byName(L, n), byName(L, 'Servidor1')))],
      ],
      hints: ['Com a ferramenta Cabo, ligue cada equipamento ao SW1 (o switch escolhe a próxima porta livre).', 'Servidor1: 192.168.10.10 · PCs: 192.168.10.11, .12 e .13 · máscara 255.255.255.0 em todos.', 'No console de um PC: ping 192.168.10.10 — ou use o botão Testar rede.'],
      learn: 'O switch junta os equipamentos numa mesma rede local (camada 2). Ele não precisa de IP.',
    },
    {
      n: '03', title: 'Configure um roteador',
      brief: 'PC-A (192.168.1.0/24) e PC-B (192.168.2.0/24) estão em redes diferentes. O R1 está ligado no meio, mas sem configuração.',
      setup(L) {
        const a = makeDev(L, 'pc', 150, 250, { name: 'PC-A', ip: '192.168.1.10', mask: '255.255.255.0' });
        const s1 = makeDev(L, 'switch', 300, 250), r = makeDev(L, 'router', 450, 250), s2 = makeDev(L, 'switch', 600, 250);
        const b = makeDev(L, 'pc', 750, 250, { name: 'PC-B', ip: '192.168.2.10', mask: '255.255.255.0' });
        link(L, a, 0, s1, 0); link(L, s1, 1, r, 0); link(L, r, 1, s2, 0); link(L, s2, 1, b, 0);
      },
      goals: [
        ['R1 G0/0 com 192.168.1.1/24 e ligada', (L) => { const i = byName(L, 'R1').ifaces[0]; return i.up && i.ip === '192.168.1.1' && maskToInt(i.mask) === prefixToMask(24); }],
        ['R1 G0/1 com 192.168.2.1/24 e ligada', (L) => { const i = byName(L, 'R1').ifaces[1]; return i.up && i.ip === '192.168.2.1' && maskToInt(i.mask) === prefixToMask(24); }],
        ['Gateway do PC-A e do PC-B apontando para o R1', (L) => byName(L, 'PC-A').gw === '192.168.1.1' && byName(L, 'PC-B').gw === '192.168.2.1'],
        ['Ping do PC-A para o PC-B responde', (L) => pinged(L, byName(L, 'PC-A'), byName(L, 'PC-B'))],
        ['Rode tracert do PC-A para o PC-B e veja o roteador no caminho', (L) => L.events.some((e) => e.trace && e.src === byName(L, 'PC-A').id && e.dst === byName(L, 'PC-B').id && e.ok)],
      ],
      hints: ['Selecione o R1. Na G0/0 coloque 192.168.1.1 / 255.255.255.0 e marque "Ligada" (no shutdown).', 'Na G0/1 do R1: 192.168.2.1 / 255.255.255.0, ligada.', 'Gateway do PC-A = 192.168.1.1 · do PC-B = 192.168.2.1. Depois: ping 192.168.2.10 e tracert 192.168.2.10 no PC-A.'],
      learn: 'Para sair da própria rede, o PC entrega o pacote ao gateway; o roteador tem uma interface em cada rede e repassa.',
    },
    {
      n: '04', title: 'Crie duas VLANs',
      brief: 'Quatro PCs no mesmo switch e na mesma faixa de IP. Separe Vendas (PC1, PC2) de TI (PC3, PC4) usando VLANs.',
      setup(L) {
        const sw = makeDev(L, 'switch', 450, 260);
        [[180, 120], [180, 400], [720, 120], [720, 400]].forEach(([x, y], k) => { const p = makeDev(L, 'pc', x, y, { ip: '192.168.50.' + (11 + k), mask: '255.255.255.0' }); link(L, p, 0, sw, k); });
      },
      goals: [
        ['Crie a VLAN 10 (Vendas) e a VLAN 20 (TI) no SW1', (L) => { const v = byName(L, 'SW1').vlans; return v.some((x) => x.id === 10) && v.some((x) => x.id === 20); }],
        ['Portas do PC1 e PC2 na VLAN 10', (L) => ['PC1', 'PC2'].every((n) => { const p = peerOf(L, byName(L, n), 0); return p && p.d.ifaces[p.i].mode === 'access' && p.d.ifaces[p.i].vlan === 10; })],
        ['Portas do PC3 e PC4 na VLAN 20', (L) => ['PC3', 'PC4'].every((n) => { const p = peerOf(L, byName(L, n), 0); return p && p.d.ifaces[p.i].mode === 'access' && p.d.ifaces[p.i].vlan === 20; })],
        ['Ping do PC1 para o PC2 responde', (L) => pinged(L, byName(L, 'PC1'), byName(L, 'PC2'))],
        ['Ping do PC1 para o PC3 falha (estão isolados)', (L) => pinged(L, byName(L, 'PC1'), byName(L, 'PC3'), false) && !reach(L, byName(L, 'PC1'), byName(L, 'PC3'))],
      ],
      hints: ['Selecione o SW1 → VLANs: crie 10 "Vendas" e 20 "TI".', 'Na tabela de portas, veja em qual Fa0/x cada PC está e escolha a VLAN.', 'No console do PC1: ping 192.168.50.12 (responde) e ping 192.168.50.13 (não responde).'],
      learn: 'VLANs dividem um switch em redes separadas: mesmo com IPs da mesma faixa, quem está em VLANs diferentes não se fala sem roteador.',
    },
    {
      n: '05', title: 'Encontre o problema da rede',
      brief: 'O PC1 não consegue acessar o Servidor1 (10.0.0.10). Investigue com ping, ipconfig e tracert. Há mais de um problema.',
      setup(L) {
        const p = makeDev(L, 'pc', 140, 260, { ip: '192.168.1.10', mask: '255.255.255.0', gw: '192.168.1.254' });
        const s1 = makeDev(L, 'switch', 300, 260), r = makeDev(L, 'router', 460, 260), s2 = makeDev(L, 'switch', 620, 260);
        const sv = makeDev(L, 'server', 780, 260, { ip: '10.0.0.10', mask: '255.255.255.0', gw: '10.0.0.1' });
        Object.assign(r.ifaces[0], { ip: '192.168.1.1', mask: '255.255.255.0', up: true });
        Object.assign(r.ifaces[1], { ip: '10.0.0.1', mask: '255.255.255.0', up: false });
        s2.vlans.push({ id: 20, name: 'SERVIDORES' });
        link(L, p, 0, s1, 0); link(L, s1, 1, r, 0); link(L, r, 1, s2, 0); link(L, s2, 1, sv, 0);
        s2.ifaces[1].vlan = 20;
      },
      goals: [
        ['Investigue: rode ping ou tracert do PC1 para 10.0.0.10', (L) => L.events.some((e) => e.src === byName(L, 'PC1').id && e.dstIp === '10.0.0.10')],
        ['Corrija o gateway do PC1', (L) => byName(L, 'PC1').gw === '192.168.1.1'],
        ['Faça o R1 alcançar a rede 10.0.0.0/24', (L) => byName(L, 'R1').ifaces[1].up && reach(L, byName(L, 'R1'), byName(L, 'Servidor1'))],
        ['Ping do PC1 para o Servidor1 responde', (L) => pinged(L, byName(L, 'PC1'), byName(L, 'Servidor1'))],
      ],
      hints: ['Comece pelo PC1: ipconfig mostra o gateway. Ele bate com o IP do R1 nessa rede (192.168.1.1)?', 'Selecione o R1 e veja as interfaces: alguma está desligada (shutdown)?', 'Ainda não? Olhe as portas do SW2: o servidor e o roteador estão na mesma VLAN?'],
      learn: 'Diagnóstico de rede é de baixo para cima: cabo e porta → VLAN → IP/máscara → gateway → roteamento.',
    },
  ];

  function link(L, a, ai, b, bi) { L.links.push({ a: { d: a.id, i: ai }, b: { d: b.id, i: bi } }); }

  /* ------------------------------------------------------------------ */
  /* Lab app                                                             */
  /* ------------------------------------------------------------------ */
  DL.createNetLab = function (game) {
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('netlab'), root: $('nlRoot'), btn: $('nlBtn') };
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { saved = {}; }
    const P = { done: saved.done || {}, sandbox: saved.sandbox || null };
    const L = { devs: [], links: [], seq: 1, events: [] };
    const U = { open: false, mode: 'free', ch: null, sel: null, selLink: null, tool: 'select', from: null, mouse: null, drag: null, out: {}, hist: [], hi: -1, err: null, hint: 0, tab: 'config', celebrated: false, testRes: null };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ done: P.done, sandbox: P.sandbox })); } catch (e) { /* private mode */ } };
    const snapshot = () => JSON.parse(JSON.stringify({ devs: L.devs, links: L.links, seq: L.seq }));

    function load(mode, ch) {
      L.devs = []; L.links = []; L.seq = 1; L.events = []; U.draft = null;
      U.sel = null; U.selLink = null; U.from = null; U.err = null; U.hint = 0; U.out = {}; U.celebrated = false; U.testRes = null;
      U.mode = mode; U.ch = ch || null;
      if (mode === 'challenge') ch.setup(L);
      else if (P.sandbox) Object.assign(L, JSON.parse(JSON.stringify(P.sandbox)), { events: [] });
      U.sel = L.devs.find(isHost) || L.devs[0] || null;
      render();
    }
    const changed = () => { if (U.mode === 'free') { P.sandbox = snapshot(); save(); } };

    /* ---------- console ---------- */
    const out = (d, text, cls) => { (U.out[d.id] = U.out[d.id] || []).push({ text, cls }); if (U.out[d.id].length > 200) U.out[d.id].shift(); };
    const prompt = (d) => (d.type === 'router' || d.type === 'switch' ? d.name + '#' : d.type === 'server' ? 'root@' + d.name.toLowerCase() + ':~$' : 'C:\\' + d.name + '>');
    function teach(d, fail) {
      out(d, '', '');
      out(d, '▸ Por que falhou: ' + fail.text, 'why');
      if (fail.tip) out(d, '▸ Como resolver: ' + fail.tip, 'tip');
    }

    function run(d, line) {
      const raw = line.trim();
      out(d, prompt(d) + ' ' + raw, 'cmd');
      if (!raw) return;
      const [cmd0, ...args] = raw.split(/\s+/);
      const cmd = cmd0.toLowerCase();
      const arg = args.join(' ');
      if (cmd === 'clear' || cmd === 'cls') { U.out[d.id] = []; return; }
      if (cmd === 'help' || cmd === '?') {
        const list = isHost(d) ? ['ipconfig            mostra IP, máscara, gateway e DNS (Windows)', 'ip addr             o mesmo, no estilo Linux', 'ping <ip|nome>      testa se o destino responde (ida e volta)', 'tracert <ip>        mostra cada roteador no caminho (traceroute também)', 'nslookup <nome>     pergunta ao DNS o IP de um nome', 'clear               limpa a tela']
          : d.type === 'router' ? ['show ip interface brief   interfaces, IPs e estado', 'show ip route             redes conectadas e rotas estáticas', 'ping <ip>                 testa a partir do roteador', 'traceroute <ip>           caminho até o destino']
            : ['show vlan brief           VLANs e portas', 'show interfaces status    portas, modo e VLAN'];
        out(d, 'Comandos disponíveis:', 'dim');
        list.forEach((x) => out(d, '  ' + x, 'dim'));
        out(d, 'A configuração é feita no painel da direita.', 'dim');
        return;
      }
      if (d.type === 'switch') {
        if (/^show$|^sh$/.test(cmd) && /^vlan/.test(arg)) {
          out(d, 'VLAN  Nome              Portas');
          d.vlans.forEach((v) => out(d, String(v.id).padEnd(6) + v.name.padEnd(18) + d.ifaces.filter((p) => p.mode === 'access' && p.vlan === v.id).map((p) => p.name).join(', ')));
          return;
        }
        if (/^show$|^sh$/.test(cmd) && /^int/.test(arg)) {
          out(d, 'Porta    Estado        Modo     VLAN  Ligado a');
          d.ifaces.forEach((p, i) => { const pr = peerOf(L, d, i); out(d, p.name.padEnd(9) + (pr ? (p.up ? 'connected' : 'disabled') : 'notconnect').padEnd(14) + p.mode.padEnd(9) + (p.mode === 'trunk' ? 'trunk' : String(p.vlan)).padEnd(6) + (pr ? pr.d.name + ' ' + pr.d.ifaces[pr.i].name : '')); });
          return;
        }
        out(d, '% Comando não reconhecido. Digite help.', 'err');
        return;
      }
      if (d.type === 'router' && /^show$|^sh$/.test(cmd)) {
        if (/^ip int/.test(arg)) {
          out(d, 'Interface  Endereço IP      Estado');
          d.ifaces.forEach((x, i) => out(d, x.name.padEnd(11) + (x.ip ? x.ip + '/' + prefixOf(maskToInt(x.mask)) : 'não definido').padEnd(17) + (x.up ? (linkAt(L, d, i) ? 'up' : 'up (sem cabo)') : 'administratively down')));
          return;
        }
        if (/^ip route/.test(arg)) {
          d.ifaces.forEach((x) => { if (x.up && conf(x)) out(d, 'C    ' + cidr(ipToInt(x.ip), maskToInt(x.mask)) + ' está diretamente conectada, ' + x.name); });
          d.routes.forEach((r) => out(d, 'S    ' + r.net + '/' + prefixOf(maskToInt(r.mask)) + ' via ' + r.via));
          if (!d.ifaces.some((x) => x.up && conf(x)) && !d.routes.length) out(d, '(tabela vazia — nenhuma interface ligada e configurada)', 'dim');
          return;
        }
      }
      if (cmd === 'ipconfig' && isHost(d)) {
        const x = d.ifaces[0];
        out(d, 'Adaptador Ethernet eth0:');
        if (!linkAt(L, d, 0)) out(d, '   Estado da mídia . . . . . . . . : mídia desconectada', 'err');
        out(d, '   Endereço IPv4. . . . . . . . . : ' + (x.ip || '(não configurado)'));
        out(d, '   Máscara de Sub-rede . . . . . . : ' + (x.mask ? intToIp(maskToInt(x.mask)) : '(não configurada)'));
        out(d, '   Gateway Padrão. . . . . . . . . : ' + (d.gw || ''));
        out(d, '   Servidores DNS. . . . . . . . . : ' + (d.dns || ''));
        return;
      }
      if (cmd === 'ip' && /^a/.test(arg) && isHost(d)) {
        const x = d.ifaces[0];
        out(d, '1: lo: <LOOPBACK,UP> inet 127.0.0.1/8');
        out(d, '2: eth0: <' + (linkAt(L, d, 0) ? 'BROADCAST,UP,LOWER_UP' : 'NO-CARRIER,BROADCAST,UP') + '>');
        out(d, x.ip ? '    inet ' + x.ip + '/' + prefixOf(maskToInt(x.mask)) + ' brd ' + intToIp(bcastOf(ipToInt(x.ip), maskToInt(x.mask))) : '    (sem endereço IPv4)');
        out(d, 'default via ' + (d.gw || '(nenhum)'), 'dim');
        return;
      }
      if (cmd === 'nslookup' && isHost(d)) {
        const r = resolve(L, d, arg);
        out(d, 'Servidor:  ' + (d.dns || '(nenhum)'));
        if (r.err) { out(d, '*** Não foi possível resolver ' + arg, 'err'); teach(d, { text: r.err, tip: r.tip }); }
        else out(d, 'Nome:    ' + arg + '\nEndereço:  ' + intToIp(r.ip));
        return;
      }
      if (cmd === 'ping') {
        if (!arg) { out(d, 'Uso: ping <endereço IP ou nome>', 'err'); return; }
        const r = ping(L, d, arg);
        const tgt = r.ip != null ? whoHas(L, r.ip) : null;
        L.events.push({ src: d.id, dst: tgt ? tgt.d.id : null, dstIp: r.ip != null ? intToIp(r.ip) : arg, ok: r.ok });
        if (r.fail && r.fail.code === 'dns') { out(d, 'A solicitação ping não pôde encontrar o host ' + arg + '.', 'err'); teach(d, r.fail); return; }
        out(d, 'Disparando ' + intToIp(r.ip) + ' com 32 bytes de dados:');
        const ttl = r.ok ? 128 - r.go.hops.filter((h) => h.dev.type === 'router').length : 0;
        for (let k = 0; k < 4; k++) {
          if (r.ok) out(d, 'Resposta de ' + intToIp(r.ip) + ': bytes=32 tempo' + (r.go.hops.length ? '=' + (1 + r.go.hops.length + k % 2) + 'ms' : '<1ms') + ' TTL=' + ttl, 'ok');
          else if (r.fail.code === 'reply' || r.fail.code === 'gw' && r.go && r.go.hops.length) out(d, 'Esgotado o tempo limite do pedido.', 'err');
          else out(d, (r.fail.at && r.fail.at.ifaces.some(conf) ? 'Resposta de ' + r.fail.at.ifaces.find(conf).ip + ': ' : '') + 'Host de destino inacessível.', 'err');
        }
        out(d, 'Estatísticas do Ping para ' + intToIp(r.ip) + ': Enviados = 4, Recebidos = ' + (r.ok ? 4 : 0) + ', Perdidos = ' + (r.ok ? 0 : 4) + ' (' + (r.ok ? 0 : 100) + '% de perda)', r.ok ? 'dim' : 'err');
        if (!r.ok) teach(d, r.fail);
        else if (r.go.hops.length) out(d, '▸ Passou por ' + r.go.hops.map((h) => h.dev.name).join(' → ') + ' e a resposta voltou.', 'tip');
        flash(r.ok ? 'ok' : 'err');
        render(true);
        return;
      }
      if (cmd === 'tracert' || cmd === 'traceroute') {
        if (!arg) { out(d, 'Uso: ' + cmd + ' <endereço IP>', 'err'); return; }
        const rr = resolve(L, d, arg);
        if (rr.err) { out(d, 'Não foi possível resolver o destino ' + arg + '.', 'err'); teach(d, { text: rr.err, tip: rr.tip }); return; }
        const go = forward(L, d, rr.ip);
        out(d, 'Rastreando a rota para ' + intToIp(rr.ip) + ' com no máximo 30 saltos:');
        let n = 1;
        for (const h of go.hops) if (!(go.ok && ipToInt(h.ip) === rr.ip)) out(d, '  ' + String(n++).padStart(2) + '    1 ms    1 ms    1 ms  ' + h.ip + '  [' + h.dev.name + ']');
        if (go.ok) {
          const back = forward(L, go.dest, ipToInt(d.ifaces.find(conf).ip));
          if (back.ok) { out(d, '  ' + String(n).padStart(2) + '    1 ms    1 ms    1 ms  ' + intToIp(rr.ip) + '  [' + go.dest.name + ']', 'ok'); out(d, 'Rastreamento concluído.', 'dim'); }
          else { out(d, '  ' + String(n).padStart(2) + '     *        *        *     Esgotado o tempo limite do pedido.', 'err'); teach(d, { text: 'O pacote chega ao ' + go.dest.name + ', mas a resposta não volta: ' + back.fail.text, tip: back.fail.tip }); }
          L.events.push({ src: d.id, dst: go.dest.id, dstIp: intToIp(rr.ip), ok: back.ok, trace: true });
        } else {
          out(d, '  ' + String(n).padStart(2) + '     *        *        *     Esgotado o tempo limite do pedido.', 'err');
          teach(d, go.fail);
          const t = whoHas(L, rr.ip);
          L.events.push({ src: d.id, dst: t ? t.d.id : null, dstIp: intToIp(rr.ip), ok: false, trace: true });
        }
        render(true);
        return;
      }
      out(d, isHost(d) ? "'" + cmd0 + "' não é reconhecido como um comando. Digite help." : '% Comando inválido. Digite help.', 'err');
    }

    /* ---------- editing ---------- */
    function addDev(type) {
      const n = L.devs.length;
      const d = makeDev(L, type, 160 + (n * 137) % 600, 110 + ((n * 89) % 330));
      U.sel = d; U.selLink = null;
      changed();
      render();
    }
    function freePort(d) {
      for (let i = 0; i < d.ifaces.length; i++) if (!linkAt(L, d, i)) return i;
      return -1;
    }
    function cable(a, b) {
      if (a === b) return showErr(bad('Não dá para ligar um equipamento nele mesmo', 'Um cabo liga duas portas de equipamentos diferentes.', 'Cabos levam o sinal de uma placa de rede até outra.', 'Clique em outro equipamento como destino.'));
      if (connected(L, a, b) && (isHost(a) || isHost(b))) return showErr(bad('Esses dois já estão ligados', 'Um PC ou servidor tem uma única placa de rede (eth0).', 'Cada porta recebe um cabo só.', 'Para ligar mais coisas, use um switch.'));
      const ia = freePort(a), ib = freePort(b);
      const full = ia < 0 ? a : ib < 0 ? b : null;
      if (full) return showErr(fullErr(full));
      link(L, a, ia, b, ib);
      U.err = null;
      changed();
      render();
      return true;
    }
    const fullErr = (full) => bad('O ' + full.name + ' não tem porta livre', isHost(full) ? 'PCs e servidores têm uma única placa de rede, já ocupada.' : 'Todas as portas do ' + full.name + ' estão em uso.', 'Cada porta aceita um cabo.', isHost(full) ? 'Ligue o ' + full.name + ' a um switch e conecte os outros ao switch.' : 'Remova um cabo ou adicione outro switch.');
    function removeSel() {
      if (U.selLink) { L.links = L.links.filter((l) => l !== U.selLink); U.selLink = null; changed(); return render(); }
      if (U.sel) { const d = U.sel; L.devs = L.devs.filter((x) => x !== d); L.links = L.links.filter((l) => l.a.d !== d.id && l.b.d !== d.id); U.sel = null; changed(); render(); }
    }
    function showErr(e) { U.err = e; render(); return false; }
    // after a successful apply the form shows the saved config again
    const okDone = () => { U.draft = null; };
    const draftOf = (key) => (U.draft && U.draft.key === key ? U.draft.vals : null);

    /* ---------- config forms ---------- */
    function applyHost(d, f) {
      const ifc = d.ifaces[0];
      const name = f.name.trim();
      if (name && !/^[A-Za-z][\w-]{0,15}$/.test(name)) return showErr(bad('Nome "' + name + '" inválido', 'Nomes de equipamento começam com letra e usam só letras, números, - e _.', 'O nome também é usado pelo DNS para achar o equipamento.', 'Ex.: PC1, Servidor-Web, Financeiro_2.'));
      if (name && L.devs.some((x) => x !== d && x.name.toLowerCase() === name.toLowerCase())) return showErr(bad('Já existe um equipamento chamado ' + name, 'Dois equipamentos com o mesmo nome confundem o DNS.', 'Cada nome deve ser único.', 'Escolha outro nome.'));
      const errs = checkAddress(L, d, ifc, f.ip.trim(), f.mask.trim());
      const hard = errs.find((e) => !e.warn);
      if (hard) return showErr(hard);
      const tmp = { ip: f.ip.trim(), mask: f.mask.trim() ? intToIp(maskToInt(f.mask.trim())) : '' };
      const g = checkGateway(tmp, f.gw.trim());
      if (g) return showErr(g);
      if (f.dns.trim()) { const e = checkIp('DNS', f.dns.trim()); if (e) return showErr(e); }
      if (name) d.name = name;
      ifc.ip = tmp.ip; ifc.mask = tmp.mask; d.gw = f.gw.trim(); d.dns = f.dns.trim();
      if (d.type === 'server') d.dnsService = !!f.dnsService;
      U.err = errs.find((e) => e.warn) || null;
      okDone();
      changed();
      flash('ok');
      render();
    }
    function applyRouterIf(d, i, f) {
      const ifc = d.ifaces[i];
      const errs = checkAddress(L, d, ifc, f.ip.trim(), f.mask.trim());
      const hard = errs.find((e) => !e.warn);
      if (hard) return showErr(hard);
      if (f.up && !f.ip.trim()) return showErr(bad('Interface ligada sem IP', 'Uma interface de roteador sem IP não participa de nenhuma rede.', 'No roteador, cada interface é o gateway de uma rede.', 'Defina IP e máscara antes de ligar (no shutdown).'));
      ifc.ip = f.ip.trim(); ifc.mask = f.mask.trim() ? intToIp(maskToInt(f.mask.trim())) : ''; ifc.up = !!f.up;
      U.err = errs.find((e) => e.warn) || null;
      okDone();
      changed(); flash('ok'); render();
    }
    function addRoute(d, f) {
      const e1 = checkIp('Rede de destino', f.net.trim()); if (e1) return showErr(e1);
      // any valid mask works for a route, including /0 (default route)
      const m = maskToInt(f.mask.trim());
      if (m == null || !maskOk(m)) return showErr(checkMask(f.mask.trim()));
      const n = ipToInt(f.net.trim());
      if (netOf(n, m) !== n) return showErr(bad(f.net + ' não é o endereço de uma rede /' + prefixOf(m), 'Numa rota, o destino é a rede inteira — os bits do equipamento precisam ser zero.', 'Com /' + prefixOf(m) + ', ' + f.net + ' pertence à rede ' + intToIp(netOf(n, m)) + '.', 'Use ' + intToIp(netOf(n, m)) + ' como rede de destino.'));
      const e3 = checkIp('Próximo salto', f.via.trim()); if (e3) return showErr(e3);
      const v = ipToInt(f.via.trim());
      if (!d.ifaces.some((x) => x.up && conf(x) && netOf(v, maskToInt(x.mask)) === netOf(ipToInt(x.ip), maskToInt(x.mask)))) return showErr(bad('O próximo salto ' + f.via + ' não está numa rede conectada ao ' + d.name, 'O roteador só consegue entregar o pacote a um vizinho direto — numa rede de uma das suas interfaces ligadas.', 'Próximo salto = IP do roteador vizinho, do outro lado do cabo.', 'Use o IP do roteador vizinho na rede que os dois compartilham.'));
      if (d.ifaces.some((x) => x.up && conf(x) && netOf(ipToInt(x.ip), m) === n && maskToInt(x.mask) === m)) return showErr(warnOf('A rede ' + f.net + ' já está conectada a uma interface', 'Redes conectadas já aparecem sozinhas na tabela (C). Rota estática é para redes que ficam atrás de outro roteador.', 'Rotas conectadas têm prioridade sobre estáticas.', 'Não precisa desta rota.'));
      d.routes.push({ net: intToIp(n), mask: intToIp(m), via: intToIp(v) });
      okDone();
      U.err = null; changed(); flash('ok'); render();
    }
    function addVlan(d, f) {
      const id = Number(f.id);
      if (!Number.isInteger(id) || id < 1 || id > 4094) return showErr(bad('VLAN "' + f.id + '" inválida', 'O número da VLAN vai de 1 a 4094.', 'A VLAN é uma rede separada dentro do switch, identificada por um número.', 'Use números como 10, 20, 30…'));
      if (id === 1) return showErr(bad('A VLAN 1 já existe', 'Todo switch vem com a VLAN 1 (default), onde ficam as portas no começo.', 'Ela não pode ser criada nem apagada.', 'Use outro número, ex.: 10.'));
      if (id >= 1002 && id <= 1005) return showErr(bad('As VLANs 1002–1005 são reservadas', 'Elas existem por compatibilidade com tecnologias antigas (Token Ring/FDDI).', 'Não podem ser usadas para redes novas.', 'Use outro número, ex.: 100.'));
      if (d.vlans.some((v) => v.id === id)) return showErr(bad('A VLAN ' + id + ' já existe neste switch', 'Cada número de VLAN aparece uma vez.', 'Para colocar portas nela, mude a VLAN na tabela de portas.', 'Escolha outro número.'));
      const name = String(f.name || '').trim().slice(0, 16) || 'VLAN' + String(id).padStart(4, '0');
      d.vlans.push({ id, name }); d.vlans.sort((a, b) => a.id - b.id);
      okDone();
      U.err = null; changed(); flash('ok'); render();
    }
    function setPort(d, i, mode, vlan) {
      const p = d.ifaces[i];
      if (mode === 'access' && !d.vlans.some((v) => v.id === vlan)) return showErr(bad('A VLAN ' + vlan + ' não existe no ' + d.name, 'Uma porta só pode entrar numa VLAN criada no switch.', 'Primeiro cria-se a VLAN, depois atribuem-se as portas.', 'Crie a VLAN ' + vlan + ' na seção VLANs.'));
      const pr = peerOf(L, d, i);
      if (mode === 'trunk' && pr && isHost(pr.d)) U.err = warnOf('Trunk numa porta de ' + pr.d.name, 'Trunk carrega várias VLANs com etiqueta; PCs comuns só entendem tráfego sem etiqueta (a VLAN nativa 1).', 'Trunk é para ligar switch a switch (ou a roteador).', 'Para um PC, use modo access na VLAN dele.');
      else U.err = null;
      p.mode = mode; if (mode === 'access') p.vlan = vlan;
      changed(); render();
    }

    /* ---------- test the whole network ---------- */
    function testAll() {
      const hosts = L.devs.filter((d) => isHost(d) && d.ifaces.some(conf));
      U.testRes = hosts.map((a) => hosts.map((b) => (a === b ? null : ping(L, a, b.ifaces.find(conf).ip).ok)));
      U.testHosts = hosts;
      render();
    }

    /* ---------- rendering ---------- */
    const ICON = {
      pc: '<rect x="-17" y="-16" width="34" height="23" rx="2"/><rect x="-14" y="-13" width="28" height="17" class="scr"/><rect x="-4" y="7" width="8" height="5"/><rect x="-11" y="12" width="22" height="3" rx="1"/>',
      server: '<rect x="-13" y="-20" width="26" height="38" rx="2"/><rect x="-9" y="-15" width="18" height="3" class="scr"/><rect x="-9" y="-8" width="18" height="3" class="scr"/><rect x="-9" y="-1" width="18" height="3" class="scr"/><circle cx="6" cy="11" r="2" class="led"/>',
      switch: '<rect x="-30" y="-10" width="60" height="20" rx="3"/>' + Array.from({ length: 8 }, (_, i) => '<rect x="' + (-25 + i * 6.5) + '" y="-2" width="4" height="5" class="port"/>').join(''),
      router: '<circle r="19"/><path d="M-9 -3 L0 -11 L9 -3 M-9 3 L0 11 L9 3" class="arr"/>',
    };
    function stagePt(ev) {
      const svg = el.root.querySelector('.nl__svg');
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    }

    function render() {
      if (!U.open) return;
      if (!el.root.firstChild) shell();
      renderSide(); renderStage(); renderPanel(); renderConsole();
    }

    function shell() {
      el.root.innerHTML =
        '<header class="app__bar nl__bar"><span class="nl__logo"><i aria-hidden="true"></i>DataLab <b>Lab de Redes</b></span>' +
        '<nav class="nl__modes" id="nlModes"></nav><button class="btn btn--sm" type="button" data-nl="test">Testar rede</button>' +
        '<button class="cc__x" type="button" data-nl="close" aria-label="Fechar laboratório">×</button></header>' +
        '<div class="nl__main"><aside class="nl__left" id="nlLeft"></aside>' +
        '<section class="nl__center"><div class="nl__stage" id="nlStage"></div><div class="nl__console" id="nlConsole"></div></section>' +
        '<aside class="nl__right" id="nlRight"></aside></div>';
    }

    function renderSide() {
      $('nlModes').innerHTML = '<button type="button" class="' + (U.mode === 'free' ? 'is-on' : '') + '" data-nl-mode="free">Livre</button>' +
        CHALLENGES.map((c, i) => '<button type="button" class="' + (U.ch === c ? 'is-on' : '') + (P.done[c.n] ? ' is-done' : '') + '" data-nl-ch="' + i + '" title="' + esc(c.title) + '">' + (P.done[c.n] ? '✓ ' : '') + 'Desafio ' + c.n + '</button>').join('');
      let h = '<span class="eyebrow-sm">Equipamentos</span><div class="nl__pal">' + Object.entries(TYPES).map(([k, t]) => '<button type="button" data-nl-add="' + k + '"><svg viewBox="-34 -24 68 48" class="nl-ico nl-ico--' + k + '">' + ICON[k] + '</svg><span>' + t.label + '</span></button>').join('') + '</div>';
      h += '<span class="eyebrow-sm">Ferramentas</span><div class="nl__tools">' + [['select', 'Selecionar', 'V'], ['cable', 'Cabo', 'C'], ['erase', 'Apagar', 'X']].map(([k, l, kb]) => '<button type="button" class="' + (U.tool === k ? 'is-on' : '') + '" data-nl-tool="' + k + '">' + l + ' <kbd>' + kb + '</kbd></button>').join('') + '</div>';
      if (U.ch) {
        const goals = U.ch.goals.map(([t, f]) => { let ok = false; try { ok = !!f(L); } catch (e) { ok = false; } return [t, ok]; });
        const all = goals.every((g) => g[1]);
        if (all && !U.celebrated) {
          U.celebrated = true;
          const first = !P.done[U.ch.n];
          P.done[U.ch.n] = true; save();
          if (first && game.economy) game.economy.earn('credits', 25, 'Lab de redes · Desafio ' + U.ch.n);
          game.toast('ok', 'Desafio ' + U.ch.n + ' concluído', U.ch.title + (first ? ' · +25 créditos' : ''));
        }
        h += '<div class="nl-ch' + (all ? ' is-done' : '') + '"><span class="eyebrow-sm">Desafio ' + U.ch.n + '</span><b>' + esc(U.ch.title) + '</b><p>' + esc(U.ch.brief) + '</p><ol class="nl-goals">' +
          goals.map(([t, ok]) => '<li class="' + (ok ? 'is-ok' : '') + '">' + esc(t) + '</li>').join('') + '</ol>' +
          (all ? '<p class="nl-learn"><b>Entenda:</b> ' + esc(U.ch.learn) + '</p>' + (CHALLENGES.indexOf(U.ch) < CHALLENGES.length - 1 ? '<button type="button" class="btn btn--sm btn--primary" data-nl-ch="' + (CHALLENGES.indexOf(U.ch) + 1) + '">Próximo desafio →</button>' : '')
            : '<div class="nl-hint">' + (U.hint ? U.ch.hints.slice(0, U.hint).map((x, i) => '<p><b>Dica ' + (i + 1) + ':</b> ' + esc(x) + '</p>').join('') : '') + (U.hint < U.ch.hints.length ? '<button type="button" class="linkbtn" data-nl="hint">' + (U.hint ? 'Mais uma dica' : 'Precisa de uma dica?') + '</button>' : '') + '</div>') +
          '<button type="button" class="linkbtn nl-reset" data-nl="reset">Recomeçar desafio</button></div>';
      } else {
        h += '<div class="nl-ch"><span class="eyebrow-sm">Modo livre</span><p>Monte qualquer rede. <b>Montar → Configurar → Testar.</b> Selecione um equipamento para configurar e use o console embaixo. Sua rede fica salva.</p><button type="button" class="linkbtn nl-reset" data-nl="clear">Limpar tudo</button></div>';
      }
      $('nlLeft').innerHTML = h;
    }

    function linkState(l) {
      const a = devOf(L, l.a.d), b = devOf(L, l.b.d);
      const ua = a.ifaces[l.a.i].up, ub = b.ifaces[l.b.i].up;
      return ua && ub ? 'up' : 'down';
    }

    function renderStage() {
      let s = '<svg class="nl__svg" viewBox="0 0 900 520" preserveAspectRatio="xMidYMid meet"><defs><pattern id="nlGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" class="nl-gridline"/></pattern></defs><rect width="900" height="520" fill="url(#nlGrid)"/>';
      for (const l of L.links) {
        const a = devOf(L, l.a.d), b = devOf(L, l.b.d);
        const st = linkState(l), on = U.selLink === l;
        const mx = (t) => a.x + (b.x - a.x) * t, my = (t) => a.y + (b.y - a.y) * t;
        s += '<g class="nl-link is-' + st + (on ? ' is-sel' : '') + '" data-nl-link="' + L.links.indexOf(l) + '"><line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="hit"/><line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="wire"/>' +
          '<circle cx="' + mx(0.2) + '" cy="' + my(0.2) + '" r="3" class="end"/><circle cx="' + mx(0.8) + '" cy="' + my(0.8) + '" r="3" class="end"/>' +
          '<text x="' + mx(0.22) + '" y="' + (my(0.22) - 7) + '" class="pl">' + a.ifaces[l.a.i].name + '</text><text x="' + mx(0.78) + '" y="' + (my(0.78) - 7) + '" class="pl">' + b.ifaces[l.b.i].name + '</text></g>';
      }
      if (U.from && U.mouse) s += '<line x1="' + U.from.x + '" y1="' + U.from.y + '" x2="' + U.mouse.x + '" y2="' + U.mouse.y + '" class="nl-pending"/>';
      for (const d of L.devs) {
        const ip = d.ifaces.find((x) => x.ip);
        const sub = isHost(d) ? (ip ? ip.ip + '/' + prefixOf(maskToInt(ip.mask) || 0) : 'sem IP') : d.type === 'switch' ? d.vlans.length + ' VLAN' + (d.vlans.length > 1 ? 's' : '') : d.ifaces.filter((x) => x.up).length + '/3 interfaces';
        s += '<g class="nl-dev nl-dev--' + d.type + (U.sel === d ? ' is-sel' : '') + (U.from === d ? ' is-from' : '') + '" data-nl-dev="' + d.id + '" transform="translate(' + d.x + ' ' + d.y + ')"><rect x="-38" y="-30" width="76" height="80" rx="8" class="halo"/><g class="ico">' + ICON[d.type] + '</g>' +
          '<text y="34" class="nm">' + esc(d.name) + '</text><text y="46" class="ip">' + esc(sub) + '</text></g>';
      }
      if (!L.devs.length) s += '<text x="450" y="260" class="nl-empty">Adicione equipamentos pela paleta à esquerda</text>';
      s += '</svg>';
      $('nlStage').innerHTML = s;
      $('nlStage').classList.toggle('is-cable', U.tool === 'cable');
      $('nlStage').classList.toggle('is-erase', U.tool === 'erase');
    }

    function errCard() {
      const e = U.err;
      if (!e) return '';
      return '<div class="nl-err' + (e.warn ? ' is-warn' : '') + '"><div class="nl-err__head"><b>' + (e.warn ? 'Atenção' : 'Configuração inválida') + '</b><button type="button" class="cc__x" data-nl="errx" aria-label="Fechar">×</button></div>' +
        '<dl><dt>O que está errado</dt><dd>' + esc(e.what) + '</dd><dt>Por quê</dt><dd>' + esc(e.why) + '</dd><dt>Entenda</dt><dd>' + esc(e.explain) + '</dd><dt>Como corrigir</dt><dd>' + esc(e.tip) + '</dd></dl></div>';
    }

    function renderPanel() {
      const d = U.sel;
      let h = errCard();
      if (U.testRes) {
        const hs = U.testHosts;
        h += '<div class="nl-test"><div class="nl-err__head"><b>Teste da rede</b><button type="button" class="cc__x" data-nl="testx" aria-label="Fechar">×</button></div>' +
          (hs.length < 2 ? '<p class="nl-muted">Configure IP em pelo menos dois PCs/servidores.</p>' : '<table><tr><th></th>' + hs.map((x) => '<th>' + esc(x.name) + '</th>').join('') + '</tr>' + hs.map((a, i) => '<tr><th>' + esc(a.name) + '</th>' + hs.map((b, j) => '<td class="' + (i === j ? '' : U.testRes[i][j] ? 'ok' : 'no') + '">' + (i === j ? '—' : U.testRes[i][j] ? '✓' : '✕') + '</td>').join('') + '</tr>').join('') + '</table><p class="nl-muted">Linha = origem, coluna = destino (ping ida e volta). Rode o ping no console para ver o porquê de um ✕.</p>') + '</div>';
      }
      if (U.selLink) {
        const l = U.selLink, a = devOf(L, l.a.d), b = devOf(L, l.b.d);
        h += '<span class="eyebrow-sm">Cabo</span><p class="nl-p">' + esc(a.name) + ' ' + a.ifaces[l.a.i].name + ' ↔ ' + esc(b.name) + ' ' + b.ifaces[l.b.i].name + '</p><button type="button" class="btn btn--sm" data-nl="del">Remover cabo <kbd>Del</kbd></button>';
      } else if (!d) h += '<p class="nl-muted">Selecione um equipamento para configurar.</p>';
      else if (isHost(d)) {
        const x = d.ifaces[0], pr = peerOf(L, d, 0), dr = draftOf(d.id + ':host:') || {};
        const v = (k, cur) => (dr[k] != null ? dr[k] : cur);
        h += '<div class="nl-pane"><span class="eyebrow-sm">' + (d.type === 'pc' ? 'PC' : 'Servidor') + ' · configuração</span><form data-nl-form="host">' +
          field('Nome', 'name', v('name', d.name)) + field('Endereço IP', 'ip', v('ip', x.ip), '192.168.1.10') + field('Máscara', 'mask', v('mask', x.mask), '255.255.255.0 ou /24') + field('Gateway padrão', 'gw', v('gw', d.gw), '192.168.1.1') + field('Servidor DNS', 'dns', v('dns', d.dns), 'IP do servidor DNS') +
          (d.type === 'server' ? '<label class="nl-check"><input type="checkbox" name="dnsService"' + (v('dnsService', d.dnsService) ? ' checked' : '') + '> Serviço DNS (traduz os nomes do laboratório)</label>' : '') +
          '<button class="btn btn--sm btn--primary" type="submit">Aplicar</button></form>' +
          '<p class="nl-muted">eth0 · ' + (pr ? 'ligada a ' + esc(pr.d.name) + ' ' + pr.d.ifaces[pr.i].name : 'sem cabo') + '</p></div>';
      } else if (d.type === 'router') {
        h += '<div class="nl-pane"><span class="eyebrow-sm">' + esc(d.name) + ' · interfaces</span>' + d.ifaces.map((x, i) => {
          const pr = peerOf(L, d, i), dr = draftOf(d.id + ':rif:' + i) || {};
          return '<form class="nl-if" data-nl-form="rif" data-i="' + i + '"><b>' + x.name + '</b><span class="nl-muted">' + (pr ? '↔ ' + esc(pr.d.name) : 'sem cabo') + '</span>' +
            '<input class="input" name="ip" value="' + esc(dr.ip != null ? dr.ip : x.ip) + '" placeholder="IP" aria-label="IP da ' + x.name + '"><input class="input" name="mask" value="' + esc(dr.mask != null ? dr.mask : x.mask) + '" placeholder="Máscara" aria-label="Máscara da ' + x.name + '">' +
            '<label class="nl-check"><input type="checkbox" name="up"' + ((dr.up != null ? dr.up : x.up) ? ' checked' : '') + '> Ligada <span class="nl-muted">(no shutdown)</span></label><button class="btn btn--sm" type="submit">Aplicar</button></form>';
        }).join('') + '</div>';
        h += '<div class="nl-pane"><span class="eyebrow-sm">Rotas estáticas</span>' + (d.routes.length ? '<ul class="nl-routes">' + d.routes.map((r, i) => '<li>' + r.net + '/' + prefixOf(maskToInt(r.mask)) + ' via ' + r.via + '<button type="button" class="cc__x" data-nl-rdel="' + i + '" aria-label="Remover rota">×</button></li>').join('') + '</ul>' : '<p class="nl-muted">Nenhuma. Redes ligadas às interfaces já são conhecidas.</p>') +
          (() => { const dr = draftOf(d.id + ':route:') || {}; return '<form class="nl-route" data-nl-form="route"><input class="input" name="net" value="' + esc(dr.net || '') + '" placeholder="Rede (ex. 10.0.2.0)"><input class="input" name="mask" value="' + esc(dr.mask || '') + '" placeholder="Máscara"><input class="input" name="via" value="' + esc(dr.via || '') + '" placeholder="Próximo salto">'; })() + '<button class="btn btn--sm" type="submit">Adicionar rota</button></form></div>';
      } else {
        h += '<div class="nl-pane"><span class="eyebrow-sm">' + esc(d.name) + ' · VLANs</span><ul class="nl-vlans">' + d.vlans.map((v) => '<li><b>' + v.id + '</b> ' + esc(v.name) + '</li>').join('') + '</ul>' +
          (() => { const dr = draftOf(d.id + ':vlan:') || {}; return '<form class="nl-route" data-nl-form="vlan"><input class="input" name="id" value="' + esc(dr.id || '') + '" placeholder="Número (ex. 10)"><input class="input" name="name" value="' + esc(dr.name || '') + '" placeholder="Nome (ex. Vendas)">'; })() + '<button class="btn btn--sm" type="submit">Criar VLAN</button></form></div>';
        h += '<div class="nl-pane"><span class="eyebrow-sm">Portas</span><table class="nl-ports"><tr><th>Porta</th><th>Ligado a</th><th>Modo</th><th>VLAN</th></tr>' + d.ifaces.map((p, i) => {
          const pr = peerOf(L, d, i);
          return '<tr><td>' + p.name + '</td><td>' + (pr ? esc(pr.d.name) : '<span class="nl-muted">—</span>') + '</td><td><select data-nl-pmode="' + i + '"><option value="access"' + (p.mode === 'access' ? ' selected' : '') + '>access</option><option value="trunk"' + (p.mode === 'trunk' ? ' selected' : '') + '>trunk</option></select></td>' +
            '<td>' + (p.mode === 'trunk' ? '<span class="nl-muted">todas</span>' : '<select data-nl-pvlan="' + i + '">' + d.vlans.map((v) => '<option value="' + v.id + '"' + (p.vlan === v.id ? ' selected' : '') + '>' + v.id + '</option>').join('') + '</select>') + '</td></tr>';
        }).join('') + '</table></div>';
      }
      $('nlRight').innerHTML = h;
    }
    const field = (label, name, val, ph) => '<label class="nl-field"><span>' + label + '</span><input class="input" name="' + name + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '" spellcheck="false" autocomplete="off"></label>';

    function renderConsole() {
      const d = U.sel, box = $('nlConsole');
      if (!d) { box.innerHTML = '<div class="nl-con__bar"><span class="eyebrow-sm">Console</span></div><div class="nl-con__out"><p class="nl-muted">Selecione um PC, servidor, roteador ou switch para usar o console.</p></div>'; box.dataset.dev = ''; return; }
      const lines = U.out[d.id] || [];
      const outHtml = (lines.length ? '' : '<p class="nl-muted">Digite help para ver os comandos.' + (isHost(d) ? ' Ex.: ipconfig · ping 192.168.1.20 · tracert 10.0.0.10' : '') + '</p>') + lines.map((l) => '<p class="' + (l.cls || '') + '">' + esc(l.text) + '</p>').join('');
      if (box.dataset.dev !== d.id) {
        box.dataset.dev = d.id;
        box.innerHTML = '<div class="nl-con__bar"><span class="eyebrow-sm">Console · ' + esc(d.name) + '</span><span class="nl-muted">↑ histórico · help</span></div><div class="nl-con__out" id="nlOut"></div>' +
          '<form class="nl-con__in" data-nl-form="cmd" autocomplete="off"><span>' + esc(prompt(d)) + '</span><input id="nlCmd" spellcheck="false" autocapitalize="off" aria-label="Comando"></form>';
      }
      box.querySelector('.nl-con__bar .eyebrow-sm').textContent = 'Console · ' + d.name;
      box.querySelector('.nl-con__in span').textContent = prompt(d);
      const o = $('nlOut');
      o.innerHTML = outHtml;
      o.scrollTop = o.scrollHeight;
    }

    function flash(kind) {
      const st = $('nlStage');
      if (!st) return;
      st.classList.remove('flash-ok', 'flash-err');
      void st.offsetWidth;
      st.classList.add('flash-' + kind);
    }

    /* ---------- input ---------- */
    el.ov.addEventListener('click', (ev) => {
      if (ev.target === el.ov) return close();
      const b = ev.target.closest('button');
      if (b) {
        const a = b.dataset.nl;
        if (a === 'close') return close();
        if (a === 'test') return testAll();
        if (a === 'testx') { U.testRes = null; return render(); }
        if (a === 'errx') { U.err = null; return render(); }
        if (a === 'hint') { U.hint++; return render(); }
        if (a === 'reset') return load('challenge', U.ch);
        if (a === 'clear') { P.sandbox = null; save(); return load('free'); }
        if (a === 'del') return removeSel();
        if (b.dataset.nlMode) return load('free');
        if (b.dataset.nlCh) return load('challenge', CHALLENGES[+b.dataset.nlCh]);
        if (b.dataset.nlAdd) return addDev(b.dataset.nlAdd);
        if (b.dataset.nlTool) { U.tool = b.dataset.nlTool; U.from = null; return render(); }
        if (b.dataset.nlRdel) { U.sel.routes.splice(+b.dataset.nlRdel, 1); changed(); return render(); }
      }
    });
    el.ov.addEventListener('change', (ev) => {
      const t = ev.target, d = U.sel;
      if (!d) return;
      if (t.dataset.nlPmode) { const i = +t.dataset.nlPmode; setPort(d, i, t.value, d.ifaces[i].vlan); }
      if (t.dataset.nlPvlan) { const i = +t.dataset.nlPvlan; setPort(d, i, 'access', +t.value); }
    });
    el.ov.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target, d = U.sel, kind = f.dataset.nlForm;
      const val = (n) => (f.elements[n] ? f.elements[n].value : '');
      if (d && kind !== 'cmd') {
        // remember the typed values: a refused form comes back as the player left it
        const vals = {};
        for (const x of f.elements) if (x.name) vals[x.name] = x.type === 'checkbox' ? x.checked : x.value;
        U.draft = { key: d.id + ':' + kind + ':' + (f.dataset.i || ''), vals };
      }
      if (kind === 'cmd') {
        const inp = f.elements[0];
        if (!d) return;
        U.hist.unshift(inp.value); U.hi = -1;
        run(d, inp.value);
        inp.value = '';
        renderSide(); renderConsole();
        return;
      }
      if (!d) return;
      if (kind === 'host') applyHost(d, { name: val('name'), ip: val('ip'), mask: val('mask'), gw: val('gw'), dns: val('dns'), dnsService: f.elements.dnsService && f.elements.dnsService.checked });
      if (kind === 'rif') applyRouterIf(d, +f.dataset.i, { ip: val('ip'), mask: val('mask'), up: f.elements.up.checked });
      if (kind === 'route') addRoute(d, { net: val('net'), mask: val('mask'), via: val('via') });
      if (kind === 'vlan') addVlan(d, { id: val('id'), name: val('name') });
    });

    // stage: select, drag, cable, erase
    el.ov.addEventListener('pointerdown', (ev) => {
      const st = ev.target.closest('#nlStage');
      if (!st) return;
      const g = ev.target.closest('[data-nl-dev]'), lk = ev.target.closest('[data-nl-link]');
      const pt = stagePt(ev);
      if (g) {
        const d = devOf(L, g.dataset.nlDev);
        if (U.tool === 'erase') { U.sel = d; U.selLink = null; return removeSel(); }
        if (U.tool === 'cable') {
          if (!U.from) { if (freePort(d) < 0) return showErr(fullErr(d)); U.from = d; U.mouse = pt; return render(); }
          const a = U.from; U.from = null; cable(a, d); return;
        }
        U.sel = d; U.selLink = null;
        U.drag = { d, ox: pt.x - d.x, oy: pt.y - d.y, moved: false };
        st.setPointerCapture(ev.pointerId);
        return render();
      }
      if (lk) {
        const l = L.links[+lk.dataset.nlLink];
        if (U.tool === 'erase') { U.selLink = l; return removeSel(); }
        U.selLink = l; U.sel = null; return render();
      }
      U.from = null;
      if (U.tool === 'select') { U.selLink = null; }
      render();
    });
    el.ov.addEventListener('pointermove', (ev) => {
      if (!ev.target.closest('#nlStage') && !U.drag) return;
      const pt = stagePt(ev);
      if (U.drag) {
        U.drag.d.x = Math.max(40, Math.min(860, Math.round((pt.x - U.drag.ox) / 10) * 10));
        U.drag.d.y = Math.max(40, Math.min(470, Math.round((pt.y - U.drag.oy) / 10) * 10));
        U.drag.moved = true;
        renderStage();
      } else if (U.from) { U.mouse = pt; renderStage(); }
    });
    el.ov.addEventListener('pointerup', () => { if (U.drag) { if (U.drag.moved) changed(); U.drag = null; } });

    function open(chIndex) {
      U.open = true;
      el.ov.classList.add('is-open');
      if (!el.root.firstChild) shell();
      if (chIndex != null) load('challenge', CHALLENGES[chIndex]);
      else if (!L.devs.length && !U.ch) load('free');
      else render();
      game.keysReset && game.keysReset();
    }
    function close() {
      U.open = false;
      U.from = null;
      el.ov.classList.remove('is-open');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    addEventListener('keydown', (ev) => {
      if (U.open) {
        ev.stopImmediatePropagation();
        const tag = document.activeElement && document.activeElement.tagName;
        const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (ev.code === 'Escape') { ev.preventDefault(); if (U.from) { U.from = null; render(); } else if (typing) document.activeElement.blur(); else close(); return; }
        if (document.activeElement && document.activeElement.id === 'nlCmd' && (ev.code === 'ArrowUp' || ev.code === 'ArrowDown')) {
          ev.preventDefault();
          U.hi = Math.max(-1, Math.min(U.hist.length - 1, U.hi + (ev.code === 'ArrowUp' ? 1 : -1)));
          document.activeElement.value = U.hi >= 0 ? U.hist[U.hi] : '';
          return;
        }
        if (typing) return;
        if (ev.code === 'Delete' || ev.code === 'Backspace') { ev.preventDefault(); removeSel(); }
        else if (ev.code === 'KeyV') { U.tool = 'select'; U.from = null; render(); }
        else if (ev.code === 'KeyC') { U.tool = 'cable'; render(); }
        else if (ev.code === 'KeyX') { U.tool = 'erase'; U.from = null; render(); }
        return;
      }
      const tag = document.activeElement && document.activeElement.tagName;
      if (ev.code === 'KeyL' && !ev.repeat && !ev.metaKey && !ev.ctrlKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && game.canHotkey && game.canHotkey()) { ev.preventDefault(); ev.stopImmediatePropagation(); open(); }
    }, true);
    if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); open(); });

    return {
      open, close,
      get isOpen() { return U.open; },
      // exposed for automated checks
      api: {
        L, U, CHALLENGES, run: (name, cmd) => { const d = byName(L, name); run(d, cmd); render(); return (U.out[d.id] || []).map((x) => x.text).join('\n'); },
        byName: (n) => byName(L, n), applyHost: (n, f) => { const d = byName(L, n); applyHost(d, Object.assign({ name: d.name, ip: d.ifaces[0].ip, mask: d.ifaces[0].mask, gw: d.gw, dns: d.dns }, f)); return U.err; },
        applyRouterIf: (n, i, f) => { applyRouterIf(byName(L, n), i, f); return U.err; }, addRoute: (n, f) => { addRoute(byName(L, n), f); return U.err; },
        addVlan: (n, f) => { addVlan(byName(L, n), f); return U.err; }, setPort: (n, i, mode, v) => { setPort(byName(L, n), i, mode, v); return U.err; },
        cable: (a, b) => cable(byName(L, a), byName(L, b)), addDev, load: (i) => (i == null ? load('free') : load('challenge', CHALLENGES[i])), goals: () => (U.ch ? U.ch.goals.map(([t, f]) => [t, !!f(L)]) : []), done: () => P.done, testAll: () => { testAll(); return U.testRes; },
        ping: (a, ip) => ping(L, byName(L, a), ip), peerOf: (n) => { const p = peerOf(L, byName(L, n), 0); return p && p.d.name + ' ' + p.d.ifaces[p.i].name; },
      },
    };
  };
})();
