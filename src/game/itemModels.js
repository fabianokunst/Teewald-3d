import * as THREE from 'three';
import { MeshBuilder, geometryFromBuilder } from '../engine/builder.js';
import { signMaterial } from '../engine/materials.js';

// Modelos low poly dos itens: na mão, na prévia do inventário e no chão.
// A pistola usa uma textura clara com o tom de aço/polímero nas cores dos vértices.
// Pistola em coordenadas próprias: cano para +z, alça de mira para +y,
// origem no topo da empunhadura (onde a mão segura).

export const PISTOL_POINTS = {
  muzzle: [0, 0.019, 0.156],
  eject: [-0.016, 0.027, 0.03],   // janela de ejeção, lado direito (-x)
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// hexaedro a partir de 4 cantos de baixo e 4 de cima (mesma ordem); faces viradas para fora
function hexa(B, mat, bot, top, uvs = 24) {
  const c = [0, 1, 2].map(i => [...bot, ...top].reduce((s, p) => s + p[i], 0) / 8);
  const face = (a, b, cc, d) => {
    const n = cross(sub(b, a), sub(cc, a));
    const m = [0, 1, 2].map(i => (a[i] + b[i] + cc[i] + d[i]) / 4);
    const uv = p => [(p[0] + p[2]) * uvs, (p[1] + p[2] * 0.5) * uvs];
    if (dot(n, sub(m, c)) >= 0) B.quad(mat, a, b, cc, d, [uv(a), uv(b), uv(cc), uv(d)]);
    else B.quad(mat, a, d, cc, b, [uv(a), uv(d), uv(cc), uv(b)]);
  };
  face(bot[0], bot[1], bot[2], bot[3]);
  face(top[0], top[1], top[2], top[3]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; face(bot[i], bot[j], top[j], top[i]); }
}

// caixa alinhada; inset estreita o topo em x (chanfro do ferrolho)
function block(B, mat, x0, x1, y0, y1, z0, z1, inset = 0) {
  hexa(B, mat,
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0 + inset, y1, z0], [x1 - inset, y1, z0], [x1 - inset, y1, z1], [x0 + inset, y1, z1]]);
}

function pistol(B) {
  B.col = [0.36, 0.37, 0.4];
  block(B, 'carPaint', -0.013, 0.013, 0, 0.032, -0.046, 0.152, 0.003);          // ferrolho
  B.col = [0.24, 0.24, 0.26];
  block(B, 'carPaint', -0.0115, 0.0115, -0.014, 0, 0.018, 0.134);               // armação
  B.col = [0.13, 0.12, 0.12];
  hexa(B, 'carPaint',                                                            // empunhadura inclinada
    [[-0.0145, -0.108, -0.072], [0.0145, -0.108, -0.072], [0.0145, -0.108, -0.03], [-0.0145, -0.108, -0.03]],
    [[-0.0135, -0.004, -0.046], [0.0135, -0.004, -0.046], [0.0135, -0.004, 0.002], [-0.0135, -0.004, 0.002]]);
  B.col = [0.28, 0.28, 0.3];
  block(B, 'carPaint', -0.016, 0.016, -0.116, -0.106, -0.076, -0.026);          // base do carregador
  block(B, 'carPaint', -0.004, 0.004, -0.042, -0.035, -0.002, 0.046);           // guarda-mato
  block(B, 'carPaint', -0.004, 0.004, -0.042, -0.012, 0.04, 0.047);
  B.col = [0.18, 0.18, 0.19];
  block(B, 'carPaint', -0.0028, 0.0028, -0.031, -0.012, 0.012, 0.02);           // gatilho
  block(B, 'carPaint', -0.008, 0.008, 0.032, 0.039, -0.044, -0.034);            // alça de mira
  block(B, 'carPaint', -0.0025, 0.0025, 0.032, 0.04, 0.138, 0.146);             // massa de mira
  // boca do cano e janela de ejeção escuras
  B.col = [0.03, 0.03, 0.03];
  B.quad('carPaint', [-0.005, 0.012, 0.1525], [0.005, 0.012, 0.1525], [0.005, 0.025, 0.1525], [-0.005, 0.025, 0.1525]);
  B.quad('carPaint', [-0.0131, 0.018, 0.012], [-0.0131, 0.018, 0.05], [-0.0131, 0.03, 0.05], [-0.0131, 0.03, 0.012]);
  B.col = [1, 1, 1];
}

function ammoBox(B) {
  const label = signMaterial('9MM', { bg: '#6b5524', fg: '#f2dc96', w: 64, h: 32, sub: 'CARTUCHOS', borderColor: '#d8b860' });
  const x = 0.05, y = 0.055, z = 0.035;
  B.col = [0.64, 0.5, 0.26];
  B.quad('flat', [-x, 0, z], [x, 0, z], [x, 0, -z], [-x, 0, -z]);                         // fundo
  B.quad('flat', [x, 0, z], [x, 0, -z], [x, y, -z], [x, y, z]);                           // lados
  B.quad('flat', [-x, 0, -z], [-x, 0, z], [-x, y, z], [-x, y, -z]);
  B.col = [0.85, 0.85, 0.85];
  B.quad('flat', [x, 0, -z], [-x, 0, -z], [-x, y, -z], [x, y, -z]);                       // trás
  B.col = [1, 1, 1];
  B.quad(label, [-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z]);                            // frente
  B.quad(label, [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [[0, 0.15], [1, 0.15], [1, 0.85], [0, 0.85]]); // tampa
}

const BUILDERS = { pistol, ammo9: ammoBox };

// THREE.Group com uma malha por material
export function makeItemModel(id, M) {
  const B = new MeshBuilder(0);
  BUILDERS[id](B);
  const g = new THREE.Group();
  for (const mat of new Set([...B.groups.values()].map(x => x.mat))) {
    const mesh = new THREE.Mesh(geometryFromBuilder(B, mat), M[mat]);
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  return g;
}
