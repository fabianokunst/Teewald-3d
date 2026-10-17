import { TEX } from './textures.js';
import { paint, mul, finish } from './archTextures.js';

// Texturas do carro do protagonista: um sedã preto de quatro portas sem coluna do meio,
// do fim dos anos 60 (lataria comprida e baixa, frisos cromados, faróis duplos na grade,
// três lanternas de cada lado). Nada de marca: os emblemas são riscos genéricos.
// A lateral é uma textura só, do para-choque de trás ao da frente: vincos das portas,
// maçanetas, frisos e lanternas laterais ficam na mesma posição da malha (game/carModel.js).

// lateral: z de trás para a frente vira u; y (altura do chão) vira v
export const SIDE = { z0: -2.72, z1: 2.72, y0: 0.18, y1: 1.0 };
// portas: dianteira de DOOR_F a DOOR_M, traseira de DOOR_M até o recorte da roda de trás
export const DOOR_F = 0.56, DOOR_M = -0.55, DOOR_R = -1.2;
export const AXLE_F = 1.68, AXLE_R = -1.34, WHEEL_R = 0.355, ARCH_R = 0.44;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// altura do vinco da cintura: sobe um pouco no paralama de trás (o "quadril" do carro)
export const beltY = z => 0.745 + 0.03 * smooth(-0.55, -1.45, z) - 0.012 * smooth(1.7, 2.6, z);

const PAINT = 18;
const chromeV = t => (t < 0.18 ? 232 : t < 0.42 ? 205 - (t - 0.18) * 260 : t < 0.5 ? 58 : 150 - (t - 0.5) * 90);
const noise = (x, y, s = 1) => (((x * 73 + y * 151 + ((x * y) % 13) * 7) % 9) - 4) * s;

const GLYPHS = {
  B: ['110', '101', '110', '101', '110'], Y: ['101', '101', '010', '010', '010'], '-': ['000', '000', '111', '000', '000'],
  1: ['010', '110', '010', '010', '111'], 9: ['111', '101', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
};

export function makeHeroCarTextures() {
  // ---- lateral ----
  const SW = 512, SH = 80;
  const zOf = px => SIDE.z0 + (px + 0.5) / SW * (SIDE.z1 - SIDE.z0);
  const yOf = py => SIDE.y1 - (py + 0.5) / SH * (SIDE.y1 - SIDE.y0);
  const dz = (SIDE.z1 - SIDE.z0) / SW, dy = (SIDE.y1 - SIDE.y0) / SH;
  const near = (a, b, tol) => Math.abs(a - b) < tol;
  // vinco de trás da porta traseira: desce reto e contorna a roda
  const rearSeam = (z, y) => {
    if (y > 0.78) return near(z, DOOR_R + (0.95 - y) * 0.5, dz * 0.8);
    const r = Math.hypot(z - AXLE_R, y - (WHEEL_R + 0.02));
    return y > 0.36 && z > AXLE_R && near(r, ARCH_R + 0.08, dz * 0.9);
  };
  TEX.hcSide = finish(paint(SW, SH, (px, py) => {
    const z = zOf(px), y = yOf(py), n = noise(px, py, 0.5);
    const belt = beltY(z);
    // friso cromado de baixo e a saia preta embaixo dele
    if (y < 0.292) return [11 + n, 11 + n, 12 + n];
    if (y < 0.338) { const c = chromeV((0.338 - y) / 0.046); return [c, c, c + 4]; }
    // lanternas laterais
    if (y > 0.565 && y < 0.635) {
      if ((z > 2.31 && z < 2.5) || (z < -2.35 && z > -2.54)) {
        const edge = y < 0.572 || y > 0.628 || z < 2.32 && z > 2.31 || Math.abs(z - 2.49) < dz || Math.abs(z + 2.36) < dz || Math.abs(z + 2.53) < dz || Math.abs(z - 2.32) < dz;
        if (edge) return [196, 196, 200];
        return z > 0 ? [214 + n, 128 + n, 34] : [150 + n, 22, 20];
      }
    }
    // maçanetas (com o rebaixo escuro embaixo) e o miolo da fechadura
    for (const z0 of [-0.36, -0.99]) {
      if (z < z0 && z > z0 - 0.11 && y > 0.832 && y < 0.862) return y < 0.84 ? [34, 34, 36] : [212 - (z0 - z) * 300, 212 - (z0 - z) * 300, 216];
    }
    if (Math.hypot((z + 0.3) / 1.3, y - 0.848) < 0.011) return [200, 200, 204];
    // risco cromado no paralama da frente (emblema genérico)
    if (z > 0.82 && z < 1.06 && y > 0.664 && y < 0.694 && ((px * 3 + py * 2) % 7) < 2) return [196, 196, 200];
    // vincos das portas
    if (y < 0.95 && y > 0.34 && (near(z, DOOR_F, dz * 0.8) || near(z, DOOR_M, dz * 0.8) || rearSeam(z, y))) return [5, 5, 6];
    // vinco da cintura pegando a luz; embaixo dele a lataria fica um pouco mais escura
    if (Math.abs(y - belt) < dy * 0.9) return [64, 64, 70];
    if (Math.abs(y - belt - dy) < dy * 0.9) return [30, 30, 34];
    // acima do vinco, o ombro do paralama clareia (pega o céu)
    const k = y > belt ? PAINT + 3 + Math.max(0, y - belt - 0.04) * 120 : PAINT - 1;
    return [k + n, k + n, k + 2 + n];
  }), false);

  // capô, teto e tampa do porta-malas: verniz preto
  TEX.hcTop = finish(paint(64, 64, (x, y) => { const n = noise(x, y, 0.6); return [PAINT + 2 + n, PAINT + 2 + n, PAINT + 4 + n]; }));

  // cromado: céu claro no alto, a linha escura do horizonte e o chão refletido embaixo
  TEX.hcChrome = finish(paint(16, 32, (x, y) => { const c = chromeV(y / 31) + noise(x, y, 0.4); return [c, c, c + 5]; }), false);

  // ---- frente: grade de lado a lado com os faróis duplos dentro ----
  const GW = 256, GH = 48;
  const gx = px => -1 + (px + 0.5) / GW * 2, gy = py => 0.8 - (py + 0.5) / GH * 0.4;
  const LIGHTS = [-0.8, -0.585, 0.585, 0.8];
  TEX.hcFront = finish(paint(GW, GH, (px, py) => {
    const x = gx(px), y = gy(py), ax = Math.abs(x), n = noise(px, py, 0.5);
    for (const cx of LIGHTS) {
      const d = Math.hypot(x - cx, (y - 0.62) * 1.0);
      if (d < 0.086) {
        if (d < 0.062) { const k = 1 - d / 0.062; return [150 + k * 90, 156 + k * 86, 166 + k * 66]; }
        const a = Math.atan2(y - 0.62, x - cx), c = 150 + Math.sin(a) * 60;
        return [c, c, c + 4];
      }
    }
    // moldura cromada da grade
    const inX = ax < 0.975, inY = y > 0.455 && y < 0.775;
    if (!inX || y > 0.79 || y < 0.44) return [PAINT + n, PAINT + n, PAINT + 2 + n];
    if (!inY || ax > 0.955) { const c = y > 0.7 ? 220 : 170; return [c, c, c + 4]; }
    // caixa dos faróis, um pouco recuada
    if (ax > 0.47 && ax < 0.92 && y > 0.53 && y < 0.71) return ax < 0.48 || ax > 0.91 || y < 0.54 || y > 0.70 ? [176, 176, 180] : [24 + n, 24 + n, 27];
    // emblema no meio
    if (ax < 0.06 && Math.abs(y - 0.61) < 0.034) return Math.abs(y - 0.61) < 0.008 ? [130, 20, 18] : [205, 205, 210];
    // barras horizontais (a do meio mais grossa) e divisões verticais finas
    if (Math.abs(y - 0.61) < 0.012) return [196, 196, 200];
    if (py % 4 === 0) { const c = 150 + (y - 0.45) * 160; return [c, c, c + 4]; }
    if (px % 30 === 0) return [70, 70, 74];
    return [12 + n, 12 + n, 13];
  }), false);

  // ---- traseira: três lanternas de cada lado e o friso da tampa ----
  const RW = 256, RH = 40;
  const rx = px => -1 + (px + 0.5) / RW * 2, ry = py => 0.8 - (py + 0.5) / RH * 0.36;
  const TAILS = [0.86, 0.69, 0.52];
  TEX.hcRear = finish(paint(RW, RH, (px, py) => {
    const x = rx(px), y = ry(py), ax = Math.abs(x), n = noise(px, py, 0.5);
    if (y > 0.768 && y < 0.79) { const c = chromeV((0.79 - y) / 0.022); return [c, c, c + 4]; }
    for (const cx of TAILS) {
      const ex = Math.abs(ax - cx), ey = Math.abs(y - 0.63);
      if (ex < 0.083 && ey < 0.054) {
        if (ex > 0.07 || ey > 0.042) return [200, 200, 204];
        return (px % 3 === 0) ? [190, 44, 38] : [150, 24, 22];
      }
    }
    // fechadura do porta-malas
    if (Math.hypot(x, (y - 0.69) * 1.2) < 0.022) return Math.hypot(x, (y - 0.69) * 1.2) < 0.01 ? [60, 60, 64] : [205, 205, 210];
    return [PAINT + n, PAINT + n, PAINT + 2 + n];
  }), false);

  // lentes acesas por cima da frente e da traseira (o material brilha com o farol ligado)
  TEX.hcHeadLens = finish(paint(32, 32, (x, y) => {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 16;
    if (d > 1) return [40, 40, 44];
    const facet = (x % 6 === 0 || y % 6 === 0) ? -18 : 0;
    const k = 1 - d;
    return [170 + k * 85 + facet, 174 + k * 80 + facet, 180 + k * 60 + facet];
  }), false);
  TEX.hcTailLens = finish(paint(32, 16, (x, y) => ((x % 4 === 0) ? [220, 60, 50] : y < 3 ? [205, 50, 44] : [175, 30, 28])), false);

  // calota inteira cromada com aletas, aro de aço e a borda do pneu
  TEX.hcWheel = finish(paint(64, 64, (x, y) => {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32, r = Math.hypot(dx, dy) / 32, a = Math.atan2(dy, dx);
    const k = 1 - 0.22 * (dx + dy) / 45;
    if (r > 0.96) return [14, 14, 15];
    if (r > 0.86) return mul([30, 30, 32], r > 0.93 ? 0.8 : 1);
    if (r > 0.8) return mul([150, 152, 156], k);
    if (r < 0.26) {
      if (r > 0.23) return [70, 70, 74];
      if (r < 0.07) return [140, 26, 22];
      return mul([215, 215, 220], k);
    }
    const fin = Math.cos(a * 12);
    if (r > 0.3 && r < 0.74) return mul(fin > 0.55 ? [226, 226, 232] : fin < -0.6 ? [96, 96, 102] : [176, 176, 182], k);
    return mul([200, 200, 206], k);
  }), false);
  // banda de rodagem e lateral do pneu
  TEX.hcTire = finish(paint(16, 16, (x, y) => ((x + (y >> 2)) % 4 === 0 ? [10, 10, 10] : [28 + noise(x, y, 0.5), 28, 29])));

  // banco de couro cor de vinho, em gomos
  TEX.hcSeat = finish(paint(32, 32, (x, y) => {
    const n = noise(x, y, 0.8), g = y % 6;
    if (g === 0) return [38, 10, 10];
    const k = g === 1 ? 1.25 : g === 5 ? 0.82 : 1;
    return [92 * k + n, 24 * k + n, 22 * k + n];
  }));
  // forro, painéis das portas e o carpete
  TEX.hcCloth = finish(paint(16, 16, (x, y) => { const n = noise(x, y, 0.6); return [34 + n, 28 + n, 27 + n]; }));

  // painel: almofada preta, friso cromado, dois relógios na frente do motorista, rádio no meio
  const DW = 128, DH = 32;
  const dxOf = px => 1 - (px + 0.5) / DW * 2, dyOf = py => 1 - (py + 0.5) / DH;
  TEX.hcDash = finish(paint(DW, DH, (px, py) => {
    const x = dxOf(px), y = dyOf(py), n = noise(px, py, 0.5);
    for (const cx of [0.53, 0.3]) {
      const d = Math.hypot((x - cx) * 3.2, (y - 0.5) * 1.15);
      if (d < 0.32) {
        if (d > 0.27) return [180, 180, 186];
        const a = Math.atan2(y - 0.5, x - cx);
        if (d > 0.2 && Math.abs(Math.sin(a * 8)) < 0.22) return [200, 196, 176];
        // ponteiro
        if (Math.abs(Math.sin(a - 0.7)) < 0.09 && Math.cos(a - 0.7) > 0) return [230, 120, 40];
        return [16 + n, 16 + n, 18];
      }
    }
    // rádio: mostrador e dois botões
    if (Math.abs(x) < 0.16 && y > 0.32 && y < 0.68) {
      if (Math.abs(x) < 0.08 && y > 0.44 && y < 0.58) return (px % 5 === 0) ? [70, 60, 40] : [150, 128, 80];
      if (Math.hypot((Math.abs(x) - 0.125) * 3, y - 0.5) < 0.06) return [210, 210, 214];
      return [150, 150, 156];
    }
    if (Math.abs(y - 0.18) < 0.035) { const c = 190 - Math.abs(y - 0.18) * 1200; return [c, c, c + 4]; }
    if (y > 0.82) return [10 + n, 10 + n, 11];
    return [20 + n, 20 + n, 22];
  }), false);

  // placa cinza antiga
  const text = 'BBY-1967', x0 = Math.floor((40 - text.length * 4 + 1) / 2);
  TEX.hcPlate = finish(paint(40, 14, (x, y) => {
    if (x === 0 || x === 39 || y === 0 || y === 13) return [30, 30, 30];
    if (y >= 2 && y <= 3 && x >= 8 && x <= 31) return x % 2 ? [120, 122, 118] : [178, 180, 176];
    const i = Math.floor((x - x0) / 4), g = (x - x0) % 4, gy = y - 6;
    if (i >= 0 && i < text.length && g < 3 && gy >= 0 && gy < 5 && GLYPHS[text[i]]?.[gy][g] === '1') return [26, 26, 26];
    return [178, 180, 176];
  }), false);
}
