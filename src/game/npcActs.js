import * as THREE from 'three';

// Gestos dos moradores, por cima da animação de andar/parado do Character: IK do braço
// (o punho vai a um ponto, o cotovelo aponta para um lado) e ações curtas que começam e
// terminam sozinhas: cruzar os braços, abraçar o corpo de frio, coçar a nuca, olhar por cima
// do ombro, fazer o sinal da cruz...
// Pontos em metros no espaço do osso do tronco (em pé, a origem fica a 0,98 m do chão),
// +z para a frente e +x para o lado esquerdo do morador; `s` é o lado do braço (-1 direito,
// +1 esquerdo), então `s * x` é "para fora" daquele braço. Referências: ombro (s·0,23, 0,46, 0),
// boca (0, 0,64, 0,1), testa (0, 0,75, 0,09), peito (0, 0,27, 0,13), cintura (s·0,17, 0,02, 0).

const ARM_A = 0.29, ARM_B = 0.25;   // ombro-cotovelo e cotovelo-punho (character.js: EL_DY, WR_DY)
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = t => t * t * (3 - 2 * t);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

// punho em (x, y, z) do tronco; o cotovelo vai para o lado do polo (px, py, pz); k mistura
// com a pose que já está nos ossos; hx dobra o punho (+ = palma para baixo/dentro)
export function armIK(A, x, y, z, px, py, pz, k, hx = null) {
  if (k <= 0.002) return;
  const S = A.sh.position;
  const d = _d.set(x - S.x, y - S.y, z - S.z);
  const len = clamp(d.length(), 0.06, (ARM_A + ARM_B) * 0.995);
  d.normalize();
  const bend = Math.PI - Math.acos(clamp((ARM_A * ARM_A + ARM_B * ARM_B - len * len) / (2 * ARM_A * ARM_B), -1, 1));
  const al = Math.acos(clamp((ARM_A * ARM_A + len * len - ARM_B * ARM_B) / (2 * ARM_A * len), -1, 1));
  // braço: da linha ombro-punho, gira para o lado do polo
  const pn = _p.set(px, py, pz);
  pn.addScaledVector(d, -pn.dot(d));
  if (pn.lengthSq() < 1e-6) pn.set(0, 0, 1).addScaledVector(d, -d.z);
  pn.normalize();
  const u = _u.copy(d).multiplyScalar(Math.cos(al)).addScaledVector(pn, Math.sin(al));
  // eixos do osso: -y ao longo do braço; +z para onde o antebraço dobra (o cotovelo dobra em x)
  _Y.copy(u).negate();
  const E = _e.copy(u).multiplyScalar(ARM_A).add(S);
  _Z.set(x - E.x, y - E.y, z - E.z);
  _Z.addScaledVector(_Y, -_Z.dot(_Y));
  if (_Z.lengthSq() < 1e-8) _Z.copy(pn).negate();
  _Z.normalize();
  _X.crossVectors(_Y, _Z);
  _q.setFromRotationMatrix(_m.makeBasis(_X, _Y, _Z));
  A.sh.quaternion.slerp(_q, k);
  A.el.rotation.x = lerp(A.el.rotation.x, -bend, k);
  if (hx !== null) A.hand.rotation.x = lerp(A.hand.rotation.x, hx, k);
}

// interpola entre pontos-chave [[t, x, y, z], ...] (t de 0 a 1)
function keys(K, u, out) {
  let i = 0;
  while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], f = ease(clamp((u - a[0]) / ((b[0] - a[0]) || 1), 0, 1));
  out[0] = lerp(a[1], b[1], f); out[1] = lerp(a[2], b[2], f); out[2] = lerp(a[3], b[3], f);
  return out;
}
const _k = [0, 0, 0];
// sinal da cruz (mão direita): testa, peito, ombro esquerdo, ombro direito
const CROSS = [[0, -0.1, 0.2, 0.2], [0.18, -0.02, 0.66, 0.2], [0.36, -0.02, 0.29, 0.22], [0.54, 0.12, 0.42, 0.19], [0.72, -0.13, 0.42, 0.19], [1, -0.08, 0.3, 0.22]];

// a = { ch, R, L, free (braço livre para gestos de uma mão), s (lado do livre), w, t, dur, side, n }
// hands: 2 = usa as duas mãos, 1 = a livre, 0 = nenhuma · walk: pode andando · sit: pode sentado
export const ACTS = {
  // braços cruzados (espera, desconfiança)
  cross: { hands: 2, walk: true, dur: [5, 10], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, -s * 0.13, 0.24 + (s > 0 ? 0.035 : 0), 0.2 - (s > 0 ? 0.02 : 0), s, -0.5, 0.3, a.w, 0.1); }
  } },
  // abraça o próprio corpo e esfrega os braços: frio, medo
  hug: { hands: 2, walk: true, sit: true, dur: [4, 8], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, -s * 0.17, 0.33 + Math.sin(a.t * 6 + s) * 0.03, 0.15, s, -0.7, 0.4, a.w, 0.2); }
    a.ch.spine.rotation.x += 0.08 * a.w;
  } },
  // mãos na cintura
  hips: { hands: 2, dur: [4, 8], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.22, 0.08, 0.02, s, 0.2, -0.8, a.w, 0.5); }
  } },
  // mãos para trás (velhos, padre)
  back: { hands: 2, walk: true, dur: [6, 12], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.05, 0.02, -0.17, s * 0.6, -0.3, -1, a.w, -0.2); }
  } },
  // mãos nos bolsos da jaqueta
  pocket: { hands: 2, walk: true, dur: [5, 10], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.19, -0.04, 0.09, s, 0.1, -0.6, a.w, 0.3); }
  } },
  // esfrega as mãos: nervoso
  wring: { hands: 2, sit: true, dur: [2.5, 5], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.03 + Math.sin(a.t * 9) * 0.015, 0.1 + Math.sin(a.t * 9 + s) * 0.01, 0.23, s, -0.6, 0.1, a.w, 0.3); }
    a.ch.head.rotation.x += 0.15 * a.w;
  } },
  // mãos juntas, rezando baixinho
  pray: { hands: 2, sit: true, dur: [5, 9], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.025, 0.25, 0.25, s, -0.8, 0, a.w, 0.6); }
    a.ch.head.rotation.x += 0.32 * a.w; a.ch.spine.rotation.x += 0.05 * a.w;
  } },
  // mãos em concha na boca, chamando (o bicho, o cachorro, a gata)
  call: { hands: 2, walk: true, dur: [1.6, 2.4], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.07, 0.6, 0.2, s, -0.6, 0.1, a.w, 0.4); }
    a.ch.head.rotation.x -= 0.15 * a.w; a.ch.spine.rotation.x -= 0.05 * a.w;
  } },
  // uma mão do lado da boca
  call1: { hands: 1, walk: true, sit: true, dur: [1.4, 2], fn(a) {
    armIK(a.free, a.s * 0.09, 0.6, 0.19, a.s, -0.7, 0, a.w, 0.4);
    a.ch.head.rotation.x -= 0.1 * a.w;
  } },
  // coça a nuca
  scratch: { hands: 1, sit: true, dur: [1.6, 2.6], fn(a) {
    armIK(a.free, a.s * 0.1 + Math.sin(a.t * 17) * 0.012, 0.71, -0.07, a.s, 0.3, 0.6, a.w, 0.6);
    a.ch.head.rotation.x += 0.12 * a.w; a.ch.head.rotation.z += a.s * 0.1 * a.w;
  } },
  // olha o relógio de pulso (braço esquerdo, se estiver livre)
  watch: { hands: 1, sit: true, dur: [1.8, 2.6], fn(a) {
    armIK(a.free, a.s * 0.05, 0.28, 0.28, a.s, -1, 0, a.w, -0.3);
    a.ch.head.rotation.x += 0.45 * a.w; a.ch.head.rotation.y += a.s * 0.3 * a.w;
  } },
  // sinal da cruz (os religiosos, depois de um susto ou quando o sino toca)
  sign: { hands: 1, sit: true, dur: [2.4, 2.8], fn(a) {
    const u = clamp(a.t / a.dur, 0, 1), p = keys(CROSS, u, _k), s = a.s;
    armIK(a.free, p[0] * -s, p[1], p[2], s, -0.6, 0.2, a.w, 0.5);
    a.ch.head.rotation.x += 0.18 * a.w;
  } },
  // toca a aba do chapéu (cumprimento)
  tip: { hands: 1, sit: true, dur: [1.1, 1.3], fn(a) {
    armIK(a.free, a.s * 0.06, 0.72, 0.2, a.s, -0.5, 0.2, a.w, 0.6);
    a.ch.head.rotation.x += 0.16 * a.w * Math.sin(Math.PI * clamp(a.t / a.dur, 0, 1));
  } },
  // mão levantada, abanando de leve (cumprimento)
  wave: { hands: 1, walk: true, sit: true, dur: [1.2, 1.5], fn(a) {
    armIK(a.free, a.s * (0.31 + Math.sin(a.t * 10) * 0.04), 0.6, 0.12, a.s, -1, -0.2, a.w, -0.2);
  } },
  // acena com a cabeça
  nod: { hands: 0, walk: true, sit: true, dur: [0.9, 1.1], fn(a) {
    a.ch.head.rotation.x += 0.22 * a.w * Math.max(0, Math.sin(a.t * 10));
  } },
  // olha por cima do ombro (para o mato), virando o tronco: o medo de todo mundo
  glance: { hands: 0, walk: true, sit: true, quick: true, dur: [1.3, 2.2], fn(a) {
    const g = a.side;
    a.ch.head.rotation.y += g * 1.05 * a.w; a.ch.spine.rotation.y += g * (a.n.mode === 'sit' ? 0.15 : 0.32) * a.w;
    a.ch.head.rotation.x -= 0.06 * a.w;
  } },
  // olha o céu escurecendo
  sky: { hands: 0, sit: true, dur: [2, 3.5], fn(a) {
    a.ch.head.rotation.x -= 0.42 * a.w; a.ch.head.rotation.y += a.side * 0.25 * a.w; a.ch.neck.rotation.x -= 0.12 * a.w;
  } },
  // alonga os braços para cima (o Tiago, esperando o treino)
  stretch: { hands: 2, dur: [2.2, 3], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.12, 0.98, 0.02, s, 0, -0.3, a.w, 0); }
    a.ch.spine.rotation.x -= 0.1 * a.w; a.ch.head.rotation.x -= 0.15 * a.w;
  } },
  // balança de um lado para o outro, mãos para trás (criança)
  sway: { hands: 2, dur: [4, 7], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.05, 0.02, -0.16, s * 0.6, -0.3, -1, a.w, -0.2); }
    const sw = Math.sin(a.t * 2.4) * a.w;
    a.ch.hips.rotation.z += sw * 0.06; a.ch.spine.rotation.z -= sw * 0.08; a.ch.head.rotation.z += sw * 0.06;
  } },
  // tira uma carta da sacola e põe na caixa de correio (o Rudi, nas casas)
  deliver: { hands: 1, dur: [2.2, 2.6], fn(a) {
    const u = clamp(a.t / a.dur, 0, 1), s = a.s;
    const K = [[0, -s * 0.02, 0.1, 0.12], [0.25, -s * 0.2, -0.04, 0.08], [0.45, -s * 0.2, -0.04, 0.08], [0.75, s * 0.06, 0.34, 0.5], [1, s * 0.06, 0.34, 0.5]];
    const p = keys(K, u, _k);
    armIK(a.free, p[0], p[1], p[2], s, -0.6, -0.1, a.w, 0.2);
    a.ch.head.rotation.x += 0.2 * a.w;
  } },
  // abre o livro e lê (o professor, o secretário)
  read: { hands: 2, item: true, dur: [4, 7], fn(a) {
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.07, 0.26, 0.3, s, -1, 0, a.w, -0.6); }
    a.ch.head.rotation.x += 0.42 * a.w;
    a.n.reading = a.w;
  } },
  // rega (o regador na mão direita)
  water: { hands: 1, item: true, dur: [3, 5], fn(a) {
    armIK(a.free, a.s * 0.14, 0.12, 0.34, a.s, -1, 0, a.w, 0);
    a.ch.head.rotation.x += 0.3 * a.w; a.ch.spine.rotation.x += 0.08 * a.w;
    a.n.pour = a.w;
  } },
  // recolhe as coisas da banca: estica os braços até a mesa e traz de volta
  pack: { hands: 2, dur: [3, 3.6], fn(a) {
    const u = clamp(a.t / a.dur, 0, 1), reach = Math.sin(Math.PI * clamp(u * 1.6, 0, 1));
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * lerp(0.14, 0.17, reach), lerp(0.18, -0.12, reach), lerp(0.24, 0.44, reach), s, -0.4, -0.3, a.w, 0.4); }
    a.ch.spine.rotation.x += 0.3 * reach * a.w; a.ch.head.rotation.x += 0.2 * a.w;
  } },
  // mexe a panela (a Dona Gertrud, atrás do balcão)
  stir: { hands: 1, dur: [4, 7], fn(a) {
    const s = a.s;
    armIK(a.free, s * (0.1 + Math.cos(a.t * 3.2) * 0.06), 0.02, 0.36 + Math.sin(a.t * 3.2) * 0.06, s, -0.5, -0.4, a.w, 0.3);
    a.ch.spine.rotation.x += 0.15 * a.w; a.ch.head.rotation.x += 0.3 * a.w;
  } },
  // sentado: cotovelos nos joelhos, mãos juntas entre as pernas
  lean: { hands: 2, sit: true, sitOnly: true, dur: [6, 12], fn(a) {
    a.ch.spine.rotation.x += 0.42 * a.w; a.ch.head.rotation.x -= 0.25 * a.w;
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.03, 0.02, 0.36, s, -1, -0.2, a.w, 0.4); }
  } },
  // sentado à mesa: queixo apoiado nas mãos (a rainha da festa que não houve)
  chin: { hands: 2, sit: true, sitOnly: true, dur: [7, 14], fn(a) {
    a.ch.spine.rotation.x += 0.28 * a.w; a.ch.head.rotation.x -= 0.12 * a.w;
    for (const A of [a.R, a.L]) { const s = A.side; armIK(A, s * 0.06, 0.5, 0.24, s * 0.3, -1, 0.2, a.w, -0.9); }
  } },
  // sentado: espia a estrada (o ônibus que não vem)
  road: { hands: 0, sit: true, sitOnly: true, dur: [3, 5], fn(a) {
    a.ch.spine.rotation.x += 0.15 * a.w; a.ch.spine.rotation.y += a.side * 0.2 * a.w; a.ch.head.rotation.y += a.side * 0.95 * a.w;
  } },
};

// ações de parado de quem não tem lista própria (npcData: idle)
export function defaultIdles(def) {
  const old = def.look?.old, female = def.look?.female;
  if (def.kid) return ['sway', 'glance', 'scratch'];
  if (old) return female ? ['hug', 'glance', 'sign', 'wring'] : ['back', 'glance', 'scratch', 'sky'];
  return female ? ['hug', 'cross', 'glance', 'sky'] : ['cross', 'pocket', 'glance', 'scratch', 'sky'];
}

// peso de entrada e saída de uma ação (t em segundos de dur)
export const actWeight = (t, dur, quick) => {
  const r = quick ? 0.22 : 0.45;
  return ease(clamp(Math.min(t / r, (dur - t) / r), 0, 1));
};
