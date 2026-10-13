// Itens do jogo e inventário (16 espaços, estilo survival horror do PS1).
// Cada espaço guarda { id, n, data }: n = quantidade (itens empilháveis) e
// data = estado do item (por exemplo, balas no pente da pistola).
// kind: 'gun' (arma de fogo/especial, vai para a mão), 'ammo', 'heal', 'throw', 'key' (item da história)

export const ITEMS = {
  pistol: {
    name: 'PISTOLA 9MM', kind: 'gun',
    desc: ['Pistola semiautomática de 9 mm.', 'Pente de 12 balas.'],
    stack: false,
  },
  ammo9: {
    name: 'MUNIÇÃO 9MM', kind: 'ammo', for: 'pistol',
    desc: ['Caixa de balas de 9 mm.', 'Recarrega a pistola.'],
    stack: true, max: 99,
  },
  shotgun: {
    name: 'ESPINGARDA', kind: 'gun',
    desc: ['Espingarda de dois canos, calibre 12,', 'da Sociedade de Atiradores. Estrago de perto.'],
    stack: false,
  },
  shells: {
    name: 'CARTUCHOS 12', kind: 'ammo', for: 'shotgun',
    desc: ['Cartuchos de chumbo grosso.', 'Recarregam a espingarda.'],
    stack: true, max: 60,
  },
  revolver: {
    name: 'REVÓLVER .38', kind: 'gun',
    desc: ['O revólver do antigo delegado,', 'guardado no museu. Seis tiros.'],
    stack: false,
  },
  silver: {
    name: 'BALAS DE PRATA', kind: 'ammo', for: 'revolver',
    desc: ['Balas fundidas com a prata da igreja.', 'Ferem o que bala comum não fere.'],
    stack: true, max: 36,
  },
  lantern: {
    name: 'LAMPIÃO BENTO', kind: 'gun',
    desc: ['Lampião abençoado pelo Padre Bernardo.', 'A luz queima o que já morreu.'],
    stack: false,
  },
  oil: {
    name: 'QUEROSENE', kind: 'ammo', for: 'lantern',
    desc: ['Lata de querosene.', 'Reabastece o lampião.'],
    stack: true, max: 9,
  },
  raygun: {
    name: 'PISTOLA DE RAIOS', kind: 'gun',
    desc: ['Arma tirada da nave caída.', 'A carga volta sozinha.'],
    stack: false,
  },
  dartgun: {
    name: 'RIFLE DE DARDOS', kind: 'gun',
    desc: ['Rifle de dardos tranquilizantes', 'da veterinária. Um dardo por vez.'],
    stack: false,
  },
  darts: {
    name: 'DARDOS', kind: 'ammo', for: 'dartgun',
    desc: ['Dardos com sedativo para boi.', 'Só fazem efeito num bicho cansado.'],
    stack: true, max: 12,
  },
  dynamite: {
    name: 'DINAMITE', kind: 'gun',
    desc: ['Bananas de dinamite da pedreira.', 'Acenda, jogue e corra.'],
    stack: true, max: 9,
  },
  cuca: {
    name: 'CUCA', kind: 'heal', heal: 35,
    desc: ['Cuca de uva da Dona Gertrud.', 'Recupera um pouco de vida.'],
    stack: true, max: 5,
  },
  cha: {
    name: 'CHÁ DE MARCELA', kind: 'heal', heal: 70,
    desc: ['Garrafa térmica com chá de marcela.', 'Recupera bastante vida.'],
    stack: true, max: 3,
  },
  // itens da história
  cross: { name: 'CRUZ DE FERRO', kind: 'key', desc: ['A cruz que selou o túmulo da bruxa', 'em 1878. Fria e pesada.'], stack: false },
  medal: { name: 'MEDALHINHA', kind: 'key', desc: ['Medalha de Nossa Senhora.', 'Atrás: "Lúcia, 1964".'], stack: false },
  shoe: { name: 'SAPATINHO VERMELHO', kind: 'key', desc: ['Sapato de noiva costurado à mão,', 'chamuscado. Nunca foi usado.'], stack: false },
  card: { name: 'CARTÃO-PONTO', kind: 'key', desc: ['Cartão-ponto de Lúcia Weber.', 'Entrada: 22h. Saída: em branco.'], stack: false },
  key: { name: 'CHAVE', kind: 'key', desc: ['Uma chave velha de ferro.'], stack: true, max: 9 },
  silverware: { name: 'PRATA', kind: 'key', desc: ['Peças de prata para fundir.'], stack: true, max: 9 },
  crystal: { name: 'CRISTAL VERDE', kind: 'key', desc: ['Pedaço da pedra que caiu do céu.', 'Brilha e zumbe na mão.'], stack: true, max: 9 },
  diary: { name: 'DIÁRIO DE 1878', kind: 'key', desc: ['Diário do Pastor Wendt, em alemão', 'antigo. Fala da bruxa Otília.'], stack: false },
};

export const PISTOL_MAG = 12;

export class Inventory {
  constructor(size = 16) {
    this.slots = new Array(size).fill(null);
    this.equipped = null;   // id da arma na mão
  }

  find(id) { return this.slots.find(s => s && s.id === id) || null; }
  has(id) { return !!this.find(id); }
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
    } else if (this.find(id)) return 0;   // arma única: já tem
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
  take(id, n = 1) {
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

  // armas que estão no inventário, na ordem de troca
  guns() { return GUN_ORDER.filter(id => this.find(id)); }

  // estado para salvar / carregar
  serialize() { return { slots: this.slots.map(s => (s ? { id: s.id, n: s.n, data: s.data } : null)), equipped: this.equipped }; }
  load(o) {
    this.slots.fill(null);
    (o?.slots || []).forEach((s, i) => { if (s && ITEMS[s.id] && i < this.slots.length) this.slots[i] = { id: s.id, n: s.n, data: s.data ? { ...s.data } : null }; });
    this.equipped = o?.equipped && this.find(o.equipped) ? o.equipped : null;
  }
}

export const GUN_ORDER = ['pistol', 'shotgun', 'revolver', 'lantern', 'raygun', 'dartgun', 'dynamite'];
