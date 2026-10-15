// Robô do teste da campanha. Roda dentro da página do jogo (tools/test-campaign.mjs
// injeta este arquivo) e não joga de verdade: a cada passo ele lê a etapa atual e faz
// o mínimo para ela andar. Teleporta até a marca, usa o ponto de interação, conversa
// com quem a história pede, derruba as criaturas e pula falas e cenas.
// Em cada etapa nova ele também testa duas coisas que costumam quebrar:
// - salva, volta pelo CONTINUAR e confere se o jogo retomou na mesma etapa;
// - (uma vez por capítulo) deixa o jogador cair e confere se ele volta na mesma etapa.
(() => {
  const T = window.__teewald, C = T.campaign;
  const B = window.__bot = {
    t: 0, events: [], lastKey: null, keyT: 0,
    resumed: new Set(), deathDone: new Set(), ran: new Map(), talked: new Set(), hitT: new Map(),
    pendingRun: null, pendingTalk: null, dying: 0,
  };
  const ev = (kind, msg) => B.events.push({ t: Math.round(B.t * 10) / 10, kind, msg });
  B.flush = () => { const e = B.events; B.events = []; return e; };

  // capítulo:etapa (o capítulo 1 é a missão original)
  B.key = () => {
    if (T.state === 'ending') return 'fim';
    if (C.index === 1) return '1:' + (T.mission.step || '-');
    const S = C.S;
    if (!S) return C.index + ':-';
    return C.index + ':' + (S.done ? 'concluído' : S.def.steps[S.i]?.id || '-');
  };

  // lugar livre perto de (x, z), sem caixa de colisão nem prédio
  const blocked = (x, z, y) => {
    const ctx = T.ctx;
    if (!ctx.indoor && ctx.zones.insideBuilding(x, z, 0.3)) return true;
    for (const it of ctx.collision.near(x, z, 1)) {
      if (it.walk) continue;
      if (y != null && (it.y1 < y + 0.35 || it.y0 > y + 1.7)) continue;
      if (it.t === 'circle') { if (Math.hypot(x - it.x, z - it.z) < it.r + 0.4) return true; continue; }
      const dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.s, lz = dx * it.s + dz * it.c;
      if (Math.abs(lx) < it.hx + 0.4 && Math.abs(lz) < it.hz + 0.4) return true;
    }
    return false;
  };
  // alvo dentro de um interior (ou fora dele): entra ou sai antes de teleportar
  const ensureIn = (x, z) => {
    const d = Object.values(T.interiors.defs).find(q => x >= q.bounds.x0 && x <= q.bounds.x1 && z >= q.bounds.z0 && z <= q.bounds.z1);
    if (d && T.ctx.indoor !== d) T.interiors.enter(d.name);
    else if (!d && T.ctx.indoor) T.interiors.exit();
  };
  const goNear = (x, z, r = 1.4, ty = null) => {
    ensureIn(x, z);
    const P = T.player.pos, ctx = T.ctx;
    const a0 = Math.atan2(P.x - x, P.z - z);
    const top = ty != null ? ty + 1.2 : ctx.indoor ? P.y + 1.5 : 1000;
    for (const rr of [r, r * 0.6, r * 1.6, r * 2.5]) {
      for (let k = 0; k < 16; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
        const b = ctx.playBounds;
        if (px < b.x0 + 0.5 || px > b.x1 - 0.5 || pz < b.z0 + 0.5 || pz > b.z1 - 0.5) continue;
        const y = ctx.groundAt(px, pz, top);
        if (blocked(px, pz, y)) continue;
        if (!ctx.indoor && ctx.isDeepWater?.(px, pz, y)) continue;
        T.teleport(px, pz, Math.atan2(x - px, z - pz));
        return true;
      }
    }
    T.teleport(x, z, 0);
    return false;
  };
  const dist = (x, z) => Math.hypot(T.player.pos.x - x, T.player.pos.z - z);

  // pula falas, narração e cenas
  const skip = () => {
    const st = T.state;
    if (st === 'read') { (C.index === 1 ? T.mission.dialogue : C.dialogue).open = false; return true; }
    if (st === 'talk') { T.npcs.dialogue.open = false; return true; }
    if (st === 'cutscene') {
      if (C.index === 1) { if (T.mission.cut) T.mission.cut.t = 99; return true; }
      const S = C.S;
      if (S?.narr) { const N = S.narr; S.narr = null; N.then?.(C); return true; }
      if (S?.cut) S.cut.t = S.cut.dur + 1;
      return true;
    }
    return false;
  };

  // derruba uma criatura: tenta todos os tipos de dano; se nada fere, encerra direto
  const KINDS = ['bullet', 'silver', 'light', 'explosion', 'fire', 'ray', 'melee', 'dart'];
  const hitFoe = (e, dt) => {
    const t = (B.hitT.get(e) || 0) + dt;
    B.hitT.set(e, t);
    const hp0 = e.hp;
    for (const kind of KINDS) {
      if (e.dead) break;
      try { e.damage(e.static ? 3 : 6, { kind, dir: { x: 0, y: 0, z: 1 }, p: e.pos, from: T.player.pos, weapon: kind === 'silver' ? 'revolver' : kind === 'dart' ? 'dartgun' : 'pistol' }); } catch (err) { /* algumas criaturas pedem mais dados */ }
    }
    // chefe que só cai em condições especiais (cansado, tonto, sem escudo): depois de um tempo, cai
    if (!e.dead && t > 6 && (e.hp === hp0 || t > 20)) { e.hp = 0; e.die?.({ kind: 'bullet' }); }
  };

  const resumeTest = key => {
    B.resumed.add(key);
    if (!C.autosave('teste', true)) return;
    let sv = null;
    try { sv = JSON.parse(localStorage.getItem('teewald.save.v1')); } catch (e) { /* nada */ }
    const want = sv?.run?.step;
    if (!want) return;
    T.continueSaved();
    const got = B.key();
    let ok = got === key;
    if (!ok && C.S) { const st = C.S.def.steps.find(s => s.id === want); ok = !!st?.resumeAs && got.endsWith(':' + st.resumeAs); }
    if (C.index === 1) ok = got === key || (want === 'fight' && got === '1:trail');
    ev(ok ? 'retomou' : 'erro', ok ? got : `retomou em ${got}, salvo em ${key}`);
    B.lastKey = B.key();
  };

  const ch1 = dt => {
    const M = T.mission, st = M.step;
    if (st === 'poster' || st === 'coop') {
      // o cartaz só conta na etapa do cartaz (ler de novo não anda)
      // (um morador perto tira o foco do cartaz: ao lado dele, lê direto)
      const id = st === 'poster' ? 'board' : 'coop', m = M.marker;
      if ((M.focus && M.focus.id === id) || (m && dist(m.x, m.z) < 3)) { M.startRead(id); T.setState('read'); return; }
      if (m) goNear(m.x, m.z, 1.2);
    } else if (st === 'trail') {
      const cl = M.site.clearing;
      if (dist(cl.x, cl.z) > 14) goNear(cl.x, cl.z, 12);
    } else if (st === 'fight') {
      const c = M.creature, t = (B.hitT.get(c) || 0) + dt;
      B.hitT.set(c, t);
      if (t > 1) { try { c.damage(4, { kind: 'bullet', dir: { x: 0, y: 0, z: 1 }, p: c.pos, from: T.player.pos }); } catch (e) { /* nada */ } }
    }
  };

  B.tick = dt => {
    B.t += dt;
    const st = T.state, key = B.key();
    if (key !== B.lastKey) { ev('etapa', key); B.lastKey = key; B.keyT = 0; B.ran.clear(); B.talked.clear(); B.pendingRun = null; B.pendingTalk = null; B.pendingPick = null; }
    else B.keyT += dt;
    if (st === 'dying') { B.dying += dt; if (B.dying > 12) ev('erro', 'jogador caído há mais de 12 s em ' + key); return; }
    B.dying = 0;
    if (skip()) return;
    if (st !== 'play' || T.fading) return;
    // jogador invencível (fora do teste de queda)
    T.combat.invuln = 99;
    const chap = C.index;
    // teste do CONTINUAR
    if (!B.resumed.has(key) && B.keyT > 1 && !key.endsWith(':concluído') && !key.endsWith(':escaped') && !key.endsWith(':done')) { resumeTest(key); return; }
    // teste da queda (uma vez por capítulo, a partir da segunda etapa)
    // (numa etapa com objetivo e fora de luta com chefe: o robô já pode ter derrubado o chefe,
    // e numa cena sem objetivo a etapa anda sozinha durante a queda)
    if (!B.deathDone.has(chap) && B.keyT > 2 && (chap === 1 ? T.mission.step === 'fight' : C.S && C.S.i >= 1 && !C.S.done && !!C.S.obj && !T.combat.boss)) {
      B.deathDone.add(chap);
      T.combat.invuln = 0; T.combat.dodge = null; T.combat.calm = false;
      T.combat.hurt(1e6);
      ev('queda', key);
      B.afterDeath = key;
      return;
    }
    if (B.afterDeath) { ev(B.key() === B.afterDeath || chap === 1 ? 'voltou' : 'erro', B.key() === B.afterDeath ? 'depois da queda: ' + B.key() : `depois da queda foi para ${B.key()} (era ${B.afterDeath})`); B.afterDeath = null; }
    if (chap === 1) { ch1(dt); return; }
    const S = C.S;
    if (!S || S.done) return;

    // 1. criaturas e alvos
    for (const e of [...T.combat.enemies]) {
      if (e.dead || e.removed || e.friendly || e === T.mission.creature) continue;
      if (B.keyT < 0.4) continue;
      hitFoe(e, dt);
    }
    // 2. ponto marcado no passo anterior: usa agora (o jogador já está lá)
    if (B.pendingRun) {
      const p = B.pendingRun; B.pendingRun = null;
      if (S.points.includes(p) && (!p.cond || p.cond(C))) { B.ran.set(p.id, B.t); p.held = 0; C._runPoint(p); return; }
    }
    if (B.pendingTalk) {
      const n = B.pendingTalk; B.pendingTalk = null;
      if (!n.hidden && n.onTalkEnd) { T.npcs.focus = n; T.npcs.startTalk(); T.setState('talk'); return; }
    }
    if (B.pendingPick) {
      const pk = B.pendingPick; B.pendingPick = null;
      if (!pk.taken && T.combat.pickups.includes(pk)) { T.combat.pick(pk); return; }
    }
    // 3. pontos de interação da etapa
    const pts = S.points.filter(p => (!p.cond || p.cond(C)) && !(B.ran.has(p.id) && B.t - B.ran.get(p.id) < 5));
    if (pts.length) {
      const p = pts[0], at = typeof p.at === 'function' ? p.at(C) : p.at;
      if (at) { goNear(at[0], at[2], Math.min(1.2, p.r * 0.6), at[1] - 1); B.pendingRun = p; return; }
    }
    // 4. quem a história pede para conversar
    for (const n of T.npcs.list) {
      if (n.hidden || !n.onTalkEnd || !n.storyTalks || B.talked.has(n.def.id)) continue;
      B.talked.add(n.def.id);
      goNear(n.pos.x, n.pos.z, 1.3);
      B.pendingTalk = n;
      return;
    }
    // 5. itens da história no chão (os que fazem algo ao pegar)
    const pk = T.combat.pickups.find(p => !p.taken && p.o.onPick);
    if (pk) { goNear(pk.x, pk.z, 0.7, pk.y); B.pendingPick = pk; return; }
    // 6. destino final da etapa (quando a marca vai por partes, como a subida da torre)
    const goal = S.def.steps[S.i]?.goal?.(C);
    if (goal && dist(goal[0], goal[2]) > 1.5) { goNear(goal[0], goal[2], 1.0, goal[1] - 1); return; }
    // 7. marca do objetivo (numa porta de saída: sai)
    const m = C.marker, ind = T.ctx.indoor;
    const exitAt = ind && m ? (ind.exits || []).find(e => Math.hypot(e.x - m.x, e.z - m.z) < 3) : null;
    if (exitAt) { goNear(exitAt.x, exitAt.z, 0.6); C._exitInterior(exitAt); return; }
    if (m && dist(m.x, m.z) > 2) { goNear(m.x, m.z, 1.2, ind ? m.y - 1.5 : null); return; }
    // 8. dentro de um interior sem nada para fazer há tempo: sai
    if (ind && B.keyT > 25) {
      const ex = ind.exits?.[0];
      if (ex) { goNear(ex.x, ex.z, 0.6); C._exitInterior(ex); B.keyT = 5; }
    }
  };

  // situação da etapa (para o relatório quando trava)
  B.status = () => {
    const S = C.S, P = T.player.pos;
    const foes = [...T.combat.enemies].filter(e => !e.dead && !e.removed).map(e => `${e.constructor.name}${e.friendly ? '(amigo)' : ''} hp=${Math.round(e.hp ?? -1)}`);
    return {
      key: B.key(), state: T.state, pos: [Math.round(P.x), Math.round(P.y), Math.round(P.z)], indoor: T.ctx.indoor?.name || null,
      obj: C.index === 1 ? T.mission.objective : S?.obj, marker: C.marker && [Math.round(C.marker.x), Math.round(C.marker.z)],
      points: S ? S.points.map(p => p.id + (p.cond && !p.cond(C) ? '(bloqueado)' : '')) : [],
      foes, flags: S ? JSON.stringify(S.flags) : null, timers: S ? S.timers.length : 0, waves: S ? S.waves.length : 0,
    };
  };
  // pula a etapa travada para testar as seguintes
  B.force = () => { if (C.S && !C.S.done && C.S.i < C.S.def.steps.length - 1) C.next(); else if (C.S && !C.S.done) C.complete(); };
})();
