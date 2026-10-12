// Colisão simples do mundo: caixas orientadas (prédios, muros), círculos (troncos,
// postes) e superfícies caminháveis (degraus, pontes). Tudo num grid espacial.

export class CollisionWorld {
  constructor(cell = 8) {
    this.cell = cell;
    this.map = new Map();
    this.items = [];
    this.stamp = 0;
  }

  _insert(item, x0, z0, x1, z1) {
    const c = this.cell;
    const id = this.items.push(item) - 1;
    item.id = id; item.mark = 0;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = i * 65536 + j;
        let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); }
        l.push(item);
      }
    return item;
  }

  // caixa: centro (x,z), meias-medidas locais hx/hz, rotação em Y, faixa de altura y0..y1
  // opts.walk = true: o topo é um piso (pode subir se estiver baixo)
  addBox(x, z, hx, hz, rot, y0, y1, opts = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const r = Math.hypot(hx, hz);
    return this._insert({ t: 'box', x, z, hx, hz, c, s, y0, y1, walk: !!opts.walk, ramp: opts.ramp || null, cam: opts.cam !== false }, x - r, z - r, x + r, z + r);
  }

  addCircle(x, z, r, y0, y1, opts = {}) {
    return this._insert({ t: 'circle', x, z, r, y0, y1, cam: !!opts.cam }, x - r, z - r, x + r, z + r);
  }

  near(x, z, rad) {
    const c = this.cell, out = [];
    this.stamp++;
    for (let i = Math.floor((x - rad) / c); i <= Math.floor((x + rad) / c); i++)
      for (let j = Math.floor((z - rad) / c); j <= Math.floor((z + rad) / c); j++) {
        const l = this.map.get(i * 65536 + j);
        if (!l) continue;
        for (const it of l) if (it.mark !== this.stamp) { it.mark = this.stamp; out.push(it); }
      }
    return out;
  }

  // coordenadas locais da caixa
  static local(b, x, z) {
    const dx = x - b.x, dz = z - b.z;
    return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  }

  // topo de uma caixa caminhável no ponto (suporta rampa ao longo de z local)
  static topAt(b, lz) {
    if (!b.ramp) return b.y1;
    const t = Math.min(1, Math.max(0, (lz + b.hz) / (2 * b.hz)));
    return b.ramp[0] + (b.ramp[1] - b.ramp[0]) * t;
  }

  // altura do piso caminhável mais alto sob o ponto, até `maxY`
  floorAt(x, z, maxY) {
    let best = -Infinity;
    for (const it of this.near(x, z, 0.5)) {
      if (it.t !== 'box' || !it.walk) continue;
      const [lx, lz] = CollisionWorld.local(it, x, z);
      if (Math.abs(lx) > it.hx || Math.abs(lz) > it.hz) continue;
      const top = CollisionWorld.topAt(it, lz);
      if (top <= maxY && top > best) best = top;
    }
    return best;
  }

  // empurra um cilindro (pos, raio, altura) para fora dos obstáculos
  resolve(p, radius, height, stepUp = 0.45) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const it of this.near(p.x, p.z, radius + 1)) {
        if (it.y1 <= p.y + stepUp && (it.walk || it.y1 <= p.y + 0.05)) continue; // dá para subir / está abaixo
        if (it.y0 >= p.y + height) continue; // acima da cabeça
        if (it.t === 'circle') {
          const dx = p.x - it.x, dz = p.z - it.z, d = Math.hypot(dx, dz), m = it.r + radius;
          if (d < m && d > 1e-6) { p.x = it.x + (dx / d) * m; p.z = it.z + (dz / d) * m; moved = true; }
        } else {
          if (it.walk && it.ramp) continue; // rampas não bloqueiam
          const [lx, lz] = CollisionWorld.local(it, p.x, p.z);
          const qx = Math.max(-it.hx, Math.min(it.hx, lx)), qz = Math.max(-it.hz, Math.min(it.hz, lz));
          let dx = lx - qx, dz = lz - qz, d = Math.hypot(dx, dz);
          if (d >= radius) continue;
          let nx, nz;
          if (d < 1e-6) {
            // centro dentro da caixa: sai pela face mais próxima
            const ex = it.hx - Math.abs(lx), ez = it.hz - Math.abs(lz);
            if (ex < ez) { nx = Math.sign(lx) || 1; nz = 0; d = -ex; } else { nx = 0; nz = Math.sign(lz) || 1; d = -ez; }
          } else { nx = dx / d; nz = dz / d; }
          const push = radius - d;
          const wx = nx * it.c + nz * it.s, wz = -nx * it.s + nz * it.c;
          p.x += wx * push; p.z += wz * push; moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // raio para a câmera: devolve a menor distância de impacto (ou maxD)
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD;
    const steps = Math.ceil(maxD / 2);
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * maxD;
      for (const it of this.near(ox + dx * t, oz + dz * t, 1.5)) {
        if (seen.has(it.id) || !it.cam) continue;
        seen.add(it.id);
        const h = it.t === 'box' ? rayBox(it, ox, oy, oz, dx, dy, dz) : rayCyl(it, ox, oy, oz, dx, dy, dz);
        if (h !== null && h < best) best = h;
      }
    }
    return best;
  }
}

function rayBox(b, ox, oy, oz, dx, dy, dz) {
  const [lx, lz] = CollisionWorld.local(b, ox, oz);
  const ldx = dx * b.c - dz * b.s, ldz = dx * b.s + dz * b.c;
  let t0 = 0, t1 = Infinity;
  const slab = (o, d, mn, mx) => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    let a = (mn - o) / d, c = (mx - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    return t0 <= t1;
  };
  if (!slab(lx, ldx, -b.hx, b.hx)) return null;
  if (!slab(lz, ldz, -b.hz, b.hz)) return null;
  if (!slab(oy, dy, b.y0, b.y1)) return null;
  return t0 > 0 ? t0 : null;
}

function rayCyl(c, ox, oy, oz, dx, dy, dz) {
  const fx = ox - c.x, fz = oz - c.z;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0 || a < 1e-9) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= 0) return null;
  const y = oy + dy * t;
  return y >= c.y0 && y <= c.y1 ? t : null;
}
