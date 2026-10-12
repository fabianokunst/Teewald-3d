// Itens do jogo e inventário (8 espaços, estilo survival horror do PS1).
// Cada espaço guarda { id, n, data }: n = quantidade (itens empilháveis) e
// data = estado do item (por exemplo, balas no pente da pistola).

export const ITEMS = {
  pistol: {
    name: 'PISTOLA 9MM',
    desc: ['Pistola semiautomática de 9 mm.', 'Pente de 12 balas.'],
    stack: false,
  },
  ammo9: {
    name: 'MUNIÇÃO 9MM',
    desc: ['Caixa de balas de 9 mm.', 'Recarrega a pistola.'],
    stack: true,
    max: 99,
  },
};

export const PISTOL_MAG = 12;

export class Inventory {
  constructor(size = 8) {
    this.slots = new Array(size).fill(null);
    this.equipped = null;   // id do item na mão
  }

  find(id) { return this.slots.find(s => s && s.id === id) || null; }
  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0); }

  // devolve quanto coube
  add(id, n = 1, data = null) {
    const def = ITEMS[id];
    let left = n;
    if (def.stack) {
      for (const s of this.slots) {
        if (!s || s.id !== id || s.n >= def.max) continue;
        const k = Math.min(left, def.max - s.n);
        s.n += k; left -= k;
        if (!left) return n;
      }
    }
    while (left > 0) {
      const i = this.slots.indexOf(null);
      if (i < 0) break;
      const k = def.stack ? Math.min(left, def.max) : 1;
      this.slots[i] = { id, n: k, data: data ? { ...data } : null };
      left -= k;
    }
    return n - left;
  }

  // tira até n unidades; devolve quantas saíram
  take(id, n) {
    let got = 0;
    for (let i = this.slots.length - 1; i >= 0 && got < n; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n - got, s.n);
      s.n -= k; got += k;
      if (s.n <= 0) { this.slots[i] = null; if (this.equipped === id && !this.find(id)) this.equipped = null; }
    }
    return got;
  }
}
