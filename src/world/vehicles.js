// Carros low poly no estilo PS1: lataria extrudada do perfil lateral, cabine em
// trapézio, vidros, faróis, lanternas, placas, para-choques e rodas de aço.
// Frente em +z local. A cor do carro tinge só a lataria (carBody).

// perfis (metros): frente, traseira, alturas do capô / linha de cintura / tampa
// traseira, base do para-brisa e do vidro traseiro, teto e eixos
const TYPES = {
  // sedã de três volumes e quatro portas
  sedan: { front: 2.05, rear: -2.05, hood: 0.8, belt: 0.88, deck: 0.85, ws: 0.72, rw: -1.12, roofF: 0.2, roofR: -0.74, roof: 1.38, wheel: 1.32, doors: [0.69, -0.08, -0.86], chrome: true },
  // hatch de dois volumes e duas portas
  hatch: { front: 1.85, rear: -1.85, hood: 0.8, belt: 0.88, deck: 0.87, ws: 0.6, rw: -1.8, roofF: 0.1, roofR: -1.5, roof: 1.4, wheel: 1.2, doors: [0.57, -0.6] },
};

const BOT = 0.3, HW = 0.82, CW = 0.78, RW = 0.64, WR = 0.3;
const WHITE = [1, 1, 1], DARK = [0.85, 0.85, 0.85];

export function car(B, ctx, x, z, rot, color, type) {
  const T = TYPES[type || (Math.abs(Math.round(x * 3 + z * 7)) % 2 ? 'sedan' : 'hatch')];
  const y0 = ctx.surfaceAt(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, ly, lz) => [x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c];
  const D = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
  // polígono convexo em coordenadas locais, virado para "out" (local)
  const face = (mat, pts, uvs, out) => {
    const w = pts.map(p => P(...p)), o = D(...out);
    const u = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]], v = [w[2][0] - w[0][0], w[2][1] - w[0][1], w[2][2] - w[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flip = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0;
    for (let i = 1; i < w.length - 1; i++) {
      if (flip) B.tri(mat, w[0], w[i + 1], w[i], uvs[0], uvs[i + 1], uvs[i]);
      else B.tri(mat, w[0], w[i], w[i + 1], uvs[0], uvs[i], uvs[i + 1]);
    }
  };
  const UV4 = [[0, 0], [1, 0], [1, 1], [0, 1]], TOP = [[0, 0.9], [1, 0.9], [1, 1], [0, 1]];
  const vb = yy => (yy - BOT) / (T.belt - BOT) * 0.92;

  // sombra no chão
  B.col = WHITE;
  face('blob', [[-1.05, 0.03, T.rear - 0.3], [1.05, 0.03, T.rear - 0.3], [1.05, 0.03, T.front + 0.3], [-1.05, 0.03, T.front + 0.3]], UV4, [0, 1, 0]);

  // ---- lataria ----
  B.col = color;
  const prof = [[T.rear, BOT], [T.front, BOT], [T.front, T.hood], [T.ws, T.belt], [T.rw, T.belt], [T.rear, T.deck]];
  for (const sg of [1, -1]) face('carBody', prof.map(([zz, yy]) => [sg * HW, yy, zz]), prof.map(([zz, yy]) => [zz / 2, vb(yy)]), [sg, 0, 0]);
  face('carBody', [[-HW, T.hood, T.front], [HW, T.hood, T.front], [HW, T.belt, T.ws], [-HW, T.belt, T.ws]], TOP, [0, 1, 0]); // capô
  face('carBody', [[-HW, T.deck, T.rear], [HW, T.deck, T.rear], [HW, T.belt, T.rw], [-HW, T.belt, T.rw]], TOP, [0, 1, 0]); // tampa traseira
  face('carBody', [[-HW, BOT, T.front], [HW, BOT, T.front], [HW, T.hood, T.front], [-HW, T.hood, T.front]], [[0, 0], [1, 0], [1, vb(T.hood)], [0, vb(T.hood)]], [0, 0, 1]);
  face('carBody', [[-HW, BOT, T.rear], [HW, BOT, T.rear], [HW, T.deck, T.rear], [-HW, T.deck, T.rear]], [[0, 0], [1, 0], [1, vb(T.deck)], [0, vb(T.deck)]], [0, 0, -1]);

  // cabine: laterais pintadas, teto, para-brisa e vidro traseiro
  for (const sg of [1, -1]) {
    face('carBody', [[sg * CW, T.belt, T.rw], [sg * CW, T.belt, T.ws], [sg * RW, T.roof, T.roofF], [sg * RW, T.roof, T.roofR]], TOP, [sg, 0.3, 0]);
    face('carBody', [[sg * CW, T.belt, T.rw], [sg * HW, T.belt, T.rw], [sg * HW, T.belt, T.ws], [sg * CW, T.belt, T.ws]], TOP, [0, 1, 0]); // ombro
  }
  face('carBody', [[-RW, T.roof, T.roofR], [RW, T.roof, T.roofR], [RW, T.roof, T.roofF], [-RW, T.roof, T.roofF]], TOP, [0, 1, 0]);
  B.col = WHITE;
  face('carWindshield', [[-CW, T.belt, T.ws], [CW, T.belt, T.ws], [RW, T.roof, T.roofF], [-RW, T.roof, T.roofF]], UV4, [0, 0.6, 1]);
  face('carRearGlass', [[CW, T.belt, T.rw], [-CW, T.belt, T.rw], [-RW, T.roof, T.roofR], [RW, T.roof, T.roofR]], UV4, [0, 0.6, -1]);

  // vidros laterais: dentro do trapézio da cabine, divididos na coluna central
  const side = (sg, h, zz) => [sg * (CW + h * (RW - CW) + 0.008), T.belt + h * (T.roof - T.belt), zz];
  const zR = h => T.rw + h * (T.roofR - T.rw) + 0.1, zF = h => T.ws + h * (T.roofF - T.ws) - 0.1;
  const zb = T.doors[1]; // coluna central
  for (const sg of [1, -1]) {
    const h0 = 0.1, h1 = 0.88;
    face('carGlass', [side(sg, h0, zb + 0.05), side(sg, h0, zF(h0)), side(sg, h1, zF(h1)), side(sg, h1, zb + 0.05)], UV4, [sg, 0.2, 0]);
    face('carGlass', [side(sg, h0, zR(h0)), side(sg, h0, zb - 0.05), side(sg, h1, zb - 0.05), side(sg, h1, zR(h1))], UV4, [sg, 0.2, 0]);
  }

  // ---- detalhes escuros: caixas de roda, friso, vincos das portas, maçanetas ----
  B.col = DARK;
  const arcs = [-T.wheel, T.wheel];
  for (const sg of [1, -1]) {
    const xo = sg * (HW + 0.003);
    for (const zc of arcs) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; pts.push([xo, WR + Math.sin(a) * 0.4, zc + Math.cos(a) * 0.4]); }
      face('tire', pts, pts.map(p => [p[2], p[1]]), [sg, 0, 0]);
    }
    const xs = sg * (HW + 0.005);
    const strip = (z0, z1, ya, yb) => face('tire', [[xs, ya, z0], [xs, ya, z1], [xs, yb, z1], [xs, yb, z0]], UV4, [sg, 0, 0]);
    // friso lateral, interrompido nas caixas de roda
    const cuts = [T.rear + 0.06, -T.wheel - 0.42, -T.wheel + 0.42, T.wheel - 0.42, T.wheel + 0.42, T.front - 0.06];
    for (let i = 0; i < cuts.length; i += 2) strip(cuts[i], cuts[i + 1], 0.55, 0.59);
    // vincos das portas e maçanetas
    const d = T.doors;
    for (const zz of d) strip(zz - 0.008, zz + 0.008, 0.36, T.belt - 0.01);
    strip(d[d.length - 1], d[0], 0.355, 0.37);
    for (let i = 1; i < d.length; i++) strip(d[i] + 0.06, d[i] + 0.2, 0.74, 0.77);
  }
  // retrovisores
  for (const sg of [1, -1]) {
    const m = P(sg * (CW + 0.1), 0, T.ws - 0.14);
    B.box('tire', m[0], y0 + T.belt + 0.02, m[2], 0.14, 0.1, 0.1, rot, { uvScale: 1 });
  }

  // ---- frente e traseira: faróis, lanternas, para-choques e placas ----
  B.col = WHITE;
  face('carFront', [[-0.78, T.hood - 0.22, T.front + 0.004], [0.78, T.hood - 0.22, T.front + 0.004], [0.78, T.hood - 0.03, T.front + 0.004], [-0.78, T.hood - 0.03, T.front + 0.004]], UV4, [0, 0, 1]);
  face('carRear', [[0.78, T.deck - 0.22, T.rear - 0.004], [-0.78, T.deck - 0.22, T.rear - 0.004], [-0.78, T.deck - 0.04, T.rear - 0.004], [0.78, T.deck - 0.04, T.rear - 0.004]], UV4, [0, 0, -1]);
  const bumper = T.chrome ? 'metalWhite' : 'tire';
  B.col = T.chrome ? [1.05, 1.05, 1.1] : DARK;
  for (const [zz, dir] of [[T.front, 1], [T.rear, -1]]) {
    const b = P(0, 0, zz + dir * 0.02);
    B.box(bumper, b[0], y0 + BOT, b[2], 1.74, 0.15, 0.14, rot, { uvScale: 1 });
  }
  B.col = WHITE;
  for (const [zz, dir] of [[T.front, 1], [T.rear, -1]]) {
    const pz = zz + dir * 0.094;
    face('carPlate', [[-0.2 * dir, BOT + 0.01, pz], [0.2 * dir, BOT + 0.01, pz], [0.2 * dir, BOT + 0.14, pz], [-0.2 * dir, BOT + 0.14, pz]], UV4, [0, 0, dir]);
  }

  // ---- rodas: pneu octogonal e roda de aço ----
  const N = 8;
  for (const sg of [1, -1]) for (const zc of arcs) {
    const xi = sg * (HW - 0.17), xo = sg * (HW + 0.04);
    const ring = i => { const a = (i / N) * Math.PI * 2 + Math.PI / N; return [Math.sin(a) * WR + WR, zc + Math.cos(a) * WR, a]; };
    B.col = DARK;
    for (let i = 0; i < N; i++) {
      const [ya, za, a0] = ring(i), [yb, zb2, a1] = ring(i + 1), am = (a0 + a1) / 2;
      face('tire', [[xi, ya, za], [xo, ya, za], [xo, yb, zb2], [xi, yb, zb2]], UV4, [0, Math.sin(am), Math.cos(am)]);
    }
    B.col = WHITE;
    const cap = [], uvs = [];
    for (let i = 0; i < N; i++) { const [yy, zz, a] = ring(i); cap.push([xo, yy, zz]); uvs.push([0.5 + 0.5 * Math.cos(a) * sg, 0.5 + 0.5 * Math.sin(a)]); }
    face('carWheel', cap, uvs, [sg, 0, 0]);
  }

  B.col = WHITE;
  (ctx.cars ||= []).push({ x, z, rot, type: T === TYPES.sedan ? 'sedan' : 'hatch' });
  ctx.collision.addBox(x, z, HW + 0.06, (T.front - T.rear) / 2 + 0.1, rot, y0, y0 + T.roof);
}
