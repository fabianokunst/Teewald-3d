// Abertura do jogo: o carro preto do protagonista chega pela VRS-873 com os faróis acesos,
// encosta no meio-fio do lado do calçadão, o motor desliga, a porta abre e ele desce. Fecha a
// porta, olha em volta e segue a pé, contornando a traseira do carro, até o calçadão; a câmera
// passa para trás dele e o jogo começa.
// Planos: (A) parada na beira da rua, o carro vindo de longe; (B) de frente para o para-brisa,
// baixo, o motor desligando e os faróis morrendo; (C) três quartos de frente para a porta, ele
// saindo; (D) a câmera do jogo, da frente dele girando até as costas.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// rota da chegada: volta pela rodovia a partir da vaga (passando para a pista anterior no
// trevo) e vem pela mão até encostar; pontos a cada metro, com a distância acumulada
export function introRoute(ctx, start) {
  const roads = ctx.roads.list.filter(r => r.name === 'VRS-873');
  let best = null;
  for (const r of roads) r.pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - start[0], p[1] - start[1]);
    if (!best || d < best.d) best = { d, r, i };
  });
  if (!best) return null;
  const { r } = best;
  let { i } = best;
  i = clamp(i, 1, r.pts.length - 2);
  // sentido: o lado direito do carro (onde ele encosta) dá para o calçadão
  const tan = (P, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const t0 = tan(r.pts, i), right = [-t0[1], t0[0]];
  const toStart = [start[0] - r.pts[i][0], start[1] - r.pts[i][1]];
  // direita de quem anda no sentido t: (-tz, tx)
  const fwd = right[0] * toStart[0] + right[1] * toStart[1] > 0 ? 1 : -1;
  // a vaga e o caminho para trás (no sentido contrário ao da chegada)
  const back = [];
  let R = r, k = i, dir = -fwd, guard = 0;
  while (guard++ < 200) {
    back.push({ p: R.pts[k], hw: R.hw });
    let len = 0;
    for (let q = 1; q < back.length; q++) len += Math.hypot(back[q].p[0] - back[q - 1].p[0], back[q].p[1] - back[q - 1].p[1]);
    if (len > 64) break;
    const nk = k + dir;
    if (nk >= 0 && nk < R.pts.length) { k = nk; continue; }
    // acabou a rua: continua na outra que sai daquela ponta seguindo reto (no trevo da pista
    // dupla, a outra pista volta no sentido contrário: essa fica de fora)
    const end = R.pts[k], prev = R.pts[k - dir] || end;
    const gx = end[0] - prev[0], gz = end[1] - prev[1], gl = Math.hypot(gx, gz) || 1;
    let next = null, bd = 0.3;
    for (const q of roads) {
      if (q === R) continue;
      const n = q.pts.length;
      for (const [e, kk, dd] of [[0, 1, 1], [n - 1, n - 2, -1]]) {
        const a = q.pts[e], b = q.pts[kk];
        if (Math.hypot(a[0] - end[0], a[1] - end[1]) > 3) continue;
        const hx = b[0] - a[0], hz = b[1] - a[1], dot = (hx * gx + hz * gz) / ((Math.hypot(hx, hz) || 1) * gl);
        if (dot > bd) { bd = dot; next = { q, k: kk, dir: dd }; }
      }
    }
    if (!next) break;
    R = next.q; k = next.k; dir = next.dir;
  }
  back.reverse();
  // na mão: um pouco à direita do meio da pista; nos últimos metros, encosta no meio-fio
  const pts = back.map(b => b.p), n = pts.length, out = [];
  let s = 0;
  const parkOff = best.r.hw - 1.15;
  for (let q = 0; q < n; q++) {
    const t = tan(pts, q), rx = -t[1], rz = t[0];
    const lane = 1.4;
    const fromEnd = (() => { let d = 0; for (let w = q; w < n - 1; w++) d += Math.hypot(pts[w + 1][0] - pts[w][0], pts[w + 1][1] - pts[w][1]); return d; })();
    const off = lane + (parkOff - lane) * ease(1 - fromEnd / 20);
    const x = pts[q][0] + rx * off, z = pts[q][1] + rz * off;
    if (out.length) s += Math.hypot(x - out[out.length - 1].x, z - out[out.length - 1].z);
    out.push({ x, z, s });
  }
  // pontos a cada metro (a pista do OSM vem a cada 2,5 m)
  const dense = [];
  for (let q = 0; q < out.length - 1; q++) {
    const a = out[q], b = out[q + 1], m = Math.max(1, Math.round(b.s - a.s));
    for (let w = 0; w < m; w++) { const f = w / m; dense.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, s: a.s + (b.s - a.s) * f }); }
  }
  dense.push(out[out.length - 1]);
  const e = dense[dense.length - 1], e0 = dense[dense.length - 3];
  return { route: dense, park: { x: e.x, z: e.z, h: Math.atan2(e.x - e0.x, e.z - e0.z) } };
}

export class CarIntro {
  // o: { car, player, tpc, camera, ctx, R, walk (caminho a pé até o calçadão), route }
  constructor(o) { Object.assign(this, o); this.done = true; }

  start() {
    const { car, route } = this;
    const R = route.route, a = R[0], b = R[4];
    car.place(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z));
    car.vx = Math.sin(car.heading) * 12; car.vz = Math.cos(car.heading) * 12;
    car.engine = true; car.rpm = 2000; car.gear = 1; car.introLights = true; car.damage = 0;
    this.player.vehicle = car; car.ch = this.player.ch;
    car.mode = 'drive'; car.anim = null;
    this.t = 0; this.shot = 'A'; this.done = false; this.stopT = null;
    car.drive(R, { speed: 12.5, decel: 2.2, onArrive: () => { this.stopT = this.t; } });
    // plano A: na calçada, uns metros à frente da vaga, baixo
    const P = route.park, fx = Math.sin(P.h), fz = Math.cos(P.h), rx = -Math.cos(P.h), rz = Math.sin(P.h);
    this.camA = { x: P.x + fx * 10 + rx * 3.4, z: P.z + fz * 10 + rz * 3.4 };
    this.look = null;
  }

  get listener() { return this.shot === 'A' || this.shot === 'B' ? this.camera.position : null; }

  // devolve true quando a abertura terminou
  update(dt, input) {
    if (this.done) return true;
    const { car, player, camera, ctx } = this;
    this.t += dt;
    const t = this.t;
    if (this.shot === 'A') {
      const c = this.camA, y = ctx.groundAt(c.x, c.z, 1000) + 1.05;
      camera.position.set(c.x, y, c.z);
      // segue o carro devagar (um pouco atrasado, como alguém virando a cabeça)
      const lx = car.pos.x, ly = car.body.y + 0.9, lz = car.pos.z;
      this.look = this.look || { x: lx, y: ly, z: lz };
      const k = Math.min(1, dt * 3);
      this.look.x += (lx - this.look.x) * k; this.look.y += (ly - this.look.y) * k; this.look.z += (lz - this.look.z) * k;
      camera.fov += (40 - camera.fov) * Math.min(1, dt * 2);
      camera.updateProjectionMatrix();
      camera.lookAt(this.look.x, this.look.y, this.look.z);
      if (this.stopT !== null && t > this.stopT + 0.5) { this.shot = 'B'; this.tB = t; }
      if (t > 16) { this.shot = 'B'; this.tB = t; }
      return false;
    }
    if (this.shot === 'B') {
      // de frente, baixo, um pouco para o lado do motorista: o para-brisa e os faróis
      const tb = t - this.tB, k = ease(tb / 2.3);
      const [cx, cz] = car.world(1.0 - k * 0.15, 6.2 - k * 0.5), [lx, lz] = car.world(0.35, -0.2);
      camera.position.set(cx, car.body.y + 1.12, cz);
      camera.fov += (34 - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
      camera.lookAt(lx, car.body.y + 0.98, lz);
      if (tb > 0.9 && car.engine) { car.ai = null; car.engine = false; car.introLights = false; car.sound.stop(); }
      if (tb > 2.1) { this.shot = 'C'; this.tC = t; car.startExit(); }
      return false;
    }
    if (this.shot === 'C') {
      // três quartos de frente para a porta; empurra devagar
      const tc = t - this.tC, k = ease(tc / 3);
      const [cx, cz] = car.world(4.3 - k * 0.5, 1.6 - k * 0.3), [lx, lz] = car.world(1.1, -0.55);
      camera.position.set(cx, car.body.y + 1.5 - k * 0.1, cz);
      camera.fov += (48 - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
      camera.lookAt(lx, car.body.y + 1.05 + k * 0.15, lz);
      if (!player.vehicle && !this.tD) {
        this.tD = t;
        // em pé: olha em volta (a rua, depois o calçadão)
        const L = player.ch.look;
        L.ty = 0.7; L.tp = 0.04; L.ttw = 0.15; L.timer = 1.2;
      }
      if (this.tD && t > this.tD + 1.3) {
        this.shot = 'D'; this.tDD = t;
        player.auto = { path: this.walk(), i: 1 };
        const tpc = this.tpc;
        tpc.yaw = player.heading + 0.6; tpc.pitch = 0.1; tpc.dist = 3.6;
        tpc.snap(player); tpc.yaw = player.heading + 0.6; tpc.pitch = 0.1;
        tpc.curDist = 3.6;
      }
      return false;
    }
    // plano D: a câmera do jogo, da frente para as costas enquanto ele anda
    const td = t - this.tDD, dur = 6.5, e = ease(td / dur);
    const tpc = this.tpc;
    tpc.yaw = player.heading + 0.6 + (Math.PI - 0.6) * e;
    tpc.pitch = 0.1 + 0.22 * e;
    tpc.dist = 3.6 + 1.0 * e;
    camera.fov += (58 - camera.fov) * Math.min(1, dt * 2);
    camera.updateProjectionMatrix();
    if (td > dur) { this.done = true; return true; }
    return false;
  }

  // pulou a abertura: carro na vaga, ele em pé na calçada
  skip() {
    const { car, route, player } = this;
    if (player.vehicle) car.eject(false);
    const P = route.park;
    car.place(P.x, P.z, P.h);
    car.engine = false; car.introLights = false; car.ai = null; car.mode = 'parked';
    this.done = true;
  }
}
