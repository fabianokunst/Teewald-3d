// Recorta os papéis do site (site/img/documentos/) das imagens dos documentos do jogo em cada
// idioma (shots/<idioma>/, feitas por node shots.mjs):
//   npm run documentos
// Cada papel é o trecho de 1440x927 a partir de (240, 59) da imagem de 1920x1080: em português
// fica em site/img/documentos/<nome>.png e nos outros idiomas em site/img/documentos/<idioma>/.
// As páginas traduzidas (npm run site) usam a versão do idioma quando ela existe.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(ROOT, 'site', 'img', 'documentos');
const RECORTE = { x: 240, y: 59, w: 1440, h: 927 };
// papel do site ← imagem do documento no jogo
const PAPEIS = {
  'jornal': 'jornal1-1',
  'oficio': 'oficio-1',
  'programa': 'programa-1',
  'redacao': 'redacao-1',
  'cartaz-boris': 'cartaz_boris-1',
  'cartaz-chupacabras': 'cartaz_chupacabras-1',
};
const IDIOMAS = ['pt', 'en', 'es', 'de'];

function lePng(arq) {
  const b = fs.readFileSync(arq);
  let p = 8, w, h, bpp;
  const idat = [];
  while (p < b.length) {
    const n = b.readUInt32BE(p), tipo = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + n);
    if (tipo === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = { 2: 3, 6: 4 }[d[9]];
      if (d[8] !== 8 || d[12] || !bpp) throw new Error(`${arq}: formato de PNG não suportado`);
    }
    if (tipo === 'IDAT') idat.push(d);
    p += 12 + n;
  }
  const bruto = zlib.inflateSync(Buffer.concat(idat)), linha = w * bpp, px = Buffer.alloc(h * linha);
  for (let y = 0; y < h; y++) {
    const filtro = bruto[y * (linha + 1)], src = y * (linha + 1) + 1, o = y * linha;
    for (let x = 0; x < linha; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, c = y ? px[o - linha + x] : 0, ac = y && x >= bpp ? px[o - linha + x - bpp] : 0;
      let v = bruto[src + x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += c;
      else if (filtro === 3) v += (a + c) >> 1;
      else if (filtro === 4) {
        const pp = a + c - ac, pa = Math.abs(pp - a), pb = Math.abs(pp - c), pc = Math.abs(pp - ac);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? c : ac;
      }
      px[o + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

const TABELA = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = TABELA[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
function bloco(tipo, dados) {
  const t = Buffer.from(tipo), n = Buffer.alloc(4), c = Buffer.alloc(4);
  n.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([n, t, dados, c]);
}
// recorte em RGB, com o filtro "sub" em cada linha (comprime bem o papel liso)
function gravaRecorte(img, { x, y, w, h }, arq) {
  const linhas = [];
  for (let j = 0; j < h; j++) {
    const l = Buffer.alloc(1 + w * 3);
    l[0] = 1;
    for (let i = 0; i < w; i++) for (let k = 0; k < 3; k++) {
      const v = img.px[((y + j) * img.w + x + i) * img.bpp + k];
      const antes = i ? img.px[((y + j) * img.w + x + i - 1) * img.bpp + k] : 0;
      l[1 + i * 3 + k] = (v - antes) & 255;
    }
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas), { level: 9 })), bloco('IEND', Buffer.alloc(0)),
  ]));
}

let n = 0;
for (const idioma of IDIOMAS) {
  for (const [nome, origem] of Object.entries(PAPEIS)) {
    const fonte = path.join(ROOT, 'shots', idioma, origem + '.png');
    if (!fs.existsSync(fonte)) { console.warn(`falta shots/${idioma}/${origem}.png (node shots.mjs)`); continue; }
    gravaRecorte(lePng(fonte), RECORTE, path.join(SAIDA, idioma === 'pt' ? '' : idioma, nome + '.png'));
    n++;
  }
}
console.log(`site/img/documentos/: ${n} papéis recortados`);
