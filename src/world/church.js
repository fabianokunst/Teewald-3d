import { frame } from './buildings.js';

// Igreja Matriz Nossa Senhora Auxiliadora (1910) — neogótica, creme com frisos
// salmão, torre central com agulha. Modelada a partir de texture/igreja.png.
// Local: fachada em +z, nave estendida para -z.

export const CHURCH = { W: 18, L: 34, wallH: 9.5, ridge: 17.5, towerW: 6, towerD: 5, towerH: 24, spire: 40, floor: 0.9 };

export function buildChurch(B, ctx, s) {
  const { P } = frame(s);
  const C = CHURCH, hw = C.W / 2, hl = C.L / 2;
  const y0 = s.y; // piso do adro
  const fy = y0 + C.floor; // piso da igreja
  const wall = 'plChurch', trim = 'plPink', roof = 'roofSlate';
  const cream = [1.02, 0.97, 0.88], pink = [1.0, 0.82, 0.74];

  // embasamento
  B.col = [0.9, 0.9, 0.9];
  B.box('stoneBase', s.x, y0 - 1.5, s.z, C.W + 0.4, C.floor + 1.5, C.L + 0.2, s.rot, { top: true, topMat: 'concrete', uvScale: 2 });
  B.col = cream;

  // paredes laterais e fundos
  const wallSide = (x0, z0, x1, z1) => {
    const a = P(x0, 0, z0), b = P(x1, 0, z1);
    B.wall(wall, a[0], a[2], b[0], b[2], fy, fy + C.wallH, { uvScale: 4, col: cream, ao: 0.82 });
  };
  wallSide(hw, hl, hw, -hl);     // direita
  wallSide(-hw, -hl, -hw, hl);   // esquerda
  // fachada (frontão inteiro)
  {
    const a = P(-hw, 0, hl), b = P(hw, 0, hl);
    B.wall(wall, a[0], a[2], b[0], b[2], fy, fy + C.wallH, { uvScale: 4, col: cream, ao: 0.85 });
    B.tri(wall, P(-hw, fy + C.wallH, hl), P(hw, fy + C.wallH, hl), P(0, fy + C.ridge, hl), [0, 0], [4.5, 0], [2.25, 2]);
  }
  // fundos com abside
  {
    const a = P(hw, 0, -hl), b = P(-hw, 0, -hl);
    B.wall(wall, a[0], a[2], b[0], b[2], fy, fy + C.wallH, { uvScale: 4, col: cream, ao: 0.82 });
    B.tri(wall, P(hw, fy + C.wallH, -hl), P(-hw, fy + C.wallH, -hl), P(0, fy + C.ridge, -hl), [0, 0], [4.5, 0], [2.25, 2]);
    // abside semi-hexagonal
    const r = 5.5, N = 4, apH = C.wallH - 1.2;
    const pts = [];
    for (let i = 0; i <= N; i++) { const a = Math.PI + (i / N) * Math.PI; pts.push([Math.cos(a) * r, -hl + Math.sin(a) * r]); }
    for (let i = 0; i < (s.apse === false ? 0 : N); i++) {
      const p0 = P(pts[i][0], 0, pts[i][1]), p1 = P(pts[i + 1][0], 0, pts[i + 1][1]);
      B.wall(wall, p1[0], p1[2], p0[0], p0[2], fy, fy + apH, { uvScale: 4, col: cream, ao: 0.82 });
      // janela
      const mx = (pts[i][0] + pts[i + 1][0]) / 2 * 1.01, mz = (pts[i][1] + pts[i + 1][1]) / 2 * 1 - 0.0;
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dz);
      const ux = dx / L * 0.7, uz = dz / L * 0.7;
      const nx = -dz / L * 0.05, nz = dx / L * 0.05;
      B.col = [1, 1, 1];
      B.quad('chLancet', P(mx + ux - nx, fy + 2.5, mz + uz - nz), P(mx - ux - nx, fy + 2.5, mz - uz - nz), P(mx - ux - nx, fy + 6.5, mz - uz - nz), P(mx + ux - nx, fy + 6.5, mz + uz - nz));
      B.col = cream;
      // telhado da abside
      B.tri(roof, P(pts[i + 1][0] * 1.08, fy + apH, pts[i + 1][1] + (pts[i + 1][1] + hl) * 0.08), P(pts[i][0] * 1.08, fy + apH, pts[i][1] + (pts[i][1] + hl) * 0.08), P(0, fy + apH + 4, -hl), [0, 0], [2, 0], [1, 2]);
    }
  }

  // telhado principal
  B.col = [1, 1, 1];
  const ov = 0.5, eaveY = fy + C.wallH - ov * 0.89;
  B.quad(roof, P(-hw - ov, eaveY, -hl - 0.3), P(-hw - ov, eaveY, hl + 0.3), P(0, fy + C.ridge, hl + 0.3), P(0, fy + C.ridge, -hl - 0.3), [[0, 0], [C.L / 2, 0], [C.L / 2, 6], [0, 6]]);
  B.quad(roof, P(hw + ov, eaveY, hl + 0.3), P(hw + ov, eaveY, -hl - 0.3), P(0, fy + C.ridge, -hl - 0.3), P(0, fy + C.ridge, hl + 0.3), [[0, 0], [C.L / 2, 0], [C.L / 2, 6], [0, 6]]);

  // contrafortes e janelas ogivais nas laterais
  const nWin = 6;
  for (let i = 0; i < nWin; i++) {
    const z = hl - 4 - i * ((C.L - 6) / (nWin - 1));
    for (const side of [1, -1]) {
      const x = side * (hw + 0.04);
      B.col = [1, 1, 1];
      const a = P(x, fy + 2.6, z + side * 0.85), b = P(x, fy + 2.6, z - side * 0.85);
      const c = P(x, fy + 7.4, z - side * 0.85), d = P(x, fy + 7.4, z + side * 0.85);
      B.quad('chLancet', a, b, c, d);
      // contraforte
      if (i < nWin - 1) {
        const zb = z - (C.L - 6) / (nWin - 1) / 2;
        const p = P(side * (hw + 0.35), 0, zb);
        B.col = pink;
        B.box(trim, p[0], fy, p[2], 0.7, 7.2, 0.8, s.rot, { uvScale: 2 });
        ctx.collision.addBox(p[0], p[2], 0.35, 0.4, s.rot, y0 - 1, fy + 7.2);
      }
    }
  }

  // frisos salmão nas quinas e no beiral do frontão
  B.col = pink;
  for (const side of [1, -1]) {
    const p = P(side * (hw - 0.3), 0, hl + 0.3);
    B.box(trim, p[0], fy, p[2], 0.8, C.wallH + 0.4, 0.7, s.rot, { uvScale: 2 });
    ctx.collision.addBox(p[0], p[2], 0.4, 0.35, s.rot, y0 - 1, fy + C.wallH + 2.0);
    // pináculo
    B.box(trim, p[0], fy + C.wallH + 0.4, p[2], 0.6, 1.6, 0.6, s.rot, { uvScale: 1 });
    const t = P(side * (hw - 0.3), fy + C.wallH + 2.0, hl + 0.3);
    pyramid(B, roof, t, 0.32, 2.2, s.rot, 4);
  }
  // friso inclinado do frontão
  for (const side of [1, -1]) {
    const a = P(side * hw, fy + C.wallH, hl + 0.06), b = P(0, fy + C.ridge, hl + 0.06);
    const a2 = P(side * hw, fy + C.wallH - 0.45, hl + 0.06), b2 = P(0, fy + C.ridge - 0.45, hl + 0.06);
    if (side > 0) B.quad(trim, a2, a, b, b2, [[0, 0], [0, 0.2], [4, 0.2], [4, 0]]);
    else B.quad(trim, a, a2, b2, b, [[0, 0.2], [0, 0], [4, 0], [4, 0.2]]);
  }
  // janelas ogivais da fachada
  B.col = [1, 1, 1];
  for (const side of [1, -1]) {
    const x = side * 6.2, z = hl + 0.05;
    B.quad('chLancet', P(x - 0.8, fy + 2.6, z), P(x + 0.8, fy + 2.6, z), P(x + 0.8, fy + 7.2, z), P(x - 0.8, fy + 7.2, z));
  }

  // torre central
  const tw = C.towerW / 2, tz0 = hl - C.towerD + 1.2, tz1 = hl + 1.2;
  const tcz = (tz0 + tz1) / 2;
  const tc = P(0, 0, tcz);
  B.col = cream;
  B.box(wall, tc[0], fy, tc[2], C.towerW, C.towerH, C.towerD, s.rot, { top: false, uvScale: 4, ao: 0.85 });
  // frisos da torre
  B.col = pink;
  for (const [lx, lz] of [[-tw, tz1], [tw, tz1], [-tw, tz0], [tw, tz0]]) {
    const p = P(lx, 0, lz);
    B.box(trim, p[0], fy, p[2], 0.6, C.towerH + 0.2, 0.6, s.rot, { uvScale: 2 });
  }
  for (const y of [C.wallH + 1.2, C.towerH - 0.6]) {
    B.box(trim, tc[0], fy + y, tc[2], C.towerW + 0.4, 0.6, C.towerD + 0.4, s.rot, { uvScale: 2 });
  }
  // portal, rosácea e janelas do campanário
  B.col = [1, 1, 1];
  const fz = tz1 + 0.05;
  B.quad('chPortal', P(-1.8, fy, fz), P(1.8, fy, fz), P(1.8, fy + 6.6, fz), P(-1.8, fy + 6.6, fz));
  B.quad('chRose', P(-1.6, fy + 8.2, fz), P(1.6, fy + 8.2, fz), P(1.6, fy + 11.4, fz), P(-1.6, fy + 11.4, fz));
  const bellY0 = fy + 15.5, bellY1 = fy + 21;
  const faces = [
    [[-1.4, fz], [1.4, fz]],
    [[tw + 0.05, tz1 - 1.1], [tw + 0.05, tz0 + 1.1]],
    [[1.4, tz0 - 0.05], [-1.4, tz0 - 0.05]],
    [[-tw - 0.05, tz0 + 1.1], [-tw - 0.05, tz1 - 1.1]],
  ];
  for (const [[ax, az], [bx, bz]] of faces) {
    B.quad('chTowerWin', P(ax, bellY0, az), P(bx, bellY0, bz), P(bx, bellY1, bz), P(ax, bellY1, az));
  }
  // agulha octogonal e pináculos
  B.col = [1, 1, 1];
  const sp = P(0, fy + C.towerH, tcz);
  pyramid(B, roof, sp, 2.9, C.spire - C.towerH, s.rot + Math.PI / 8, 8);
  for (const [lx, lz] of [[-tw, tz1], [tw, tz1], [-tw, tz0], [tw, tz0]]) {
    const p = P(lx, fy + C.towerH, lz);
    pyramid(B, roof, p, 0.45, 3.2, s.rot, 4);
  }
  // cruz
  const ct = P(0, 0, tcz);
  B.col = [0.35, 0.33, 0.3];
  B.box('iron', ct[0], fy + C.spire - 0.2, ct[2], 0.14, 2.4, 0.14, s.rot, { uvScale: 1 });
  B.box('iron', ct[0], fy + C.spire + 1.3, ct[2], 1.2, 0.14, 0.14, s.rot, { uvScale: 1 });

  // escadaria
  B.col = [0.95, 0.95, 0.95];
  const steps = 5, sd = 0.45;
  for (let i = 0; i < steps; i++) {
    const lz = tz1 + 0.4 + (steps - i) * sd - sd / 2;
    const p = P(0, 0, lz);
    const h = ((i + 1) / steps) * C.floor;
    B.box('granite', p[0], y0 - 0.4, p[2], 11, h + 0.4, sd, s.rot, { uvScale: 2 });
  }
  B.col = [1, 1, 1];

  // colisão
  const col = ctx.collision;
  col.addBox(s.x, s.z, hw + 0.4, hl + 0.1, s.rot, y0 - 2, fy + C.ridge);
  col.addBox(tc[0], tc[2], tw + 0.3, C.towerD / 2 + 0.1, s.rot, y0, fy + C.spire);
  if (s.apse !== false) {
    const back = P(0, 0, -hl - 3);
    col.addBox(back[0], back[2], 5.5, 3, s.rot, y0, fy + 9);
  }
  // degraus como rampa caminhável
  const st = P(0, 0, tz1 + 0.4 + (steps * sd) / 2);
  col.addBox(st[0], st[2], 5.5, (steps * sd) / 2, s.rot, y0 - 1, y0 + C.floor, { walk: true, ramp: [y0 + C.floor, y0], cam: false });
  return { fy, front: P(0, y0, tz1 + 0.4 + steps * sd) };
}

// pirâmide/agulha com n lados
export function pyramid(B, mat, base, r, h, rot, n) {
  const [x, y, z] = base;
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r];
    const p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
    B.tri(mat, p1, p0, [x, y + h, z], [0, 0], [1, 0], [0.5, h / 2]);
  }
}
