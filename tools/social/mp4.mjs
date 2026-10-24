// Monta um .mp4 (H.264 + AAC) com os pedaços que o VideoEncoder e o AudioEncoder do Chrome
// devolvem. Sem dependências: é o mínimo do ISO BMFF que o Instagram e os players aceitam.
// O moov vai na frente (início rápido) e as amostras ficam intercaladas de segundo em segundo.
//
// video: { width, height, fps, avcC, samples: [{ data, key }] }   (na ordem de decodificação,
//        pts em microssegundos em cada amostra quando houver quadros B)
// audio: { rate, channels, asc, samples: [{ data }] }  (AAC de 1024 amostras por quadro)

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
const u8 = n => Buffer.from([n & 0xff]);
const str = s => Buffer.from(s, 'latin1');
const zeros = n => Buffer.alloc(n);
const box = (type, ...parts) => {
  const body = Buffer.concat(parts.map(p => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
  return Buffer.concat([u32(body.length + 8), str(type), body]);
};
const full = (type, version, flags, ...parts) => box(type, u8(version), u8(flags >> 16), u16(flags), ...parts);
const MATRIX = Buffer.concat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

// descritor MPEG-4 (esds): tag + tamanho em 4 bytes
const desc = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  const n = body.length;
  return Buffer.concat([u8(tag), Buffer.from([0x80 | (n >> 21) & 0x7f, 0x80 | (n >> 14) & 0x7f, 0x80 | (n >> 7) & 0x7f, n & 0x7f]), body]);
};

function stbl(sampleEntry, t) {
  const n = t.sizes.length;
  const parts = [full('stsd', 0, 0, u32(1), sampleEntry)];
  parts.push(full('stts', 0, 0, u32(t.stts.length), ...t.stts.flatMap(([c, d]) => [u32(c), u32(d)])));
  if (t.ctts) parts.push(full('ctts', 0, 0, u32(t.ctts.length), ...t.ctts.flatMap(([c, d]) => [u32(c), u32(d)])));
  if (t.sync) parts.push(full('stss', 0, 0, u32(t.sync.length), ...t.sync.map(u32)));
  // stsc: corridas de pedaços com o mesmo número de amostras
  const runs = [];
  t.chunks.forEach((c, i) => { if (!runs.length || runs[runs.length - 1][1] !== c.count) runs.push([i + 1, c.count]); });
  parts.push(full('stsc', 0, 0, u32(runs.length), ...runs.flatMap(([f, c]) => [u32(f), u32(c), u32(1)])));
  parts.push(full('stsz', 0, 0, u32(0), u32(n), ...t.sizes.map(u32)));
  parts.push(full('stco', 0, 0, u32(t.chunks.length), ...t.chunks.map(c => u32(c.offset))));
  return box('stbl', ...parts);
}

function trak(id, t, durMovie) {
  const video = t.kind === 'video';
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(durMovie), zeros(8), u16(0), u16(0),
    u16(video ? 0 : 0x0100), u16(0), MATRIX, u32(video ? t.width << 16 : 0), u32(video ? t.height << 16 : 0));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(t.duration), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), str(video ? 'vide' : 'soun'), zeros(12), str(video ? 'VideoHandler\0' : 'SoundHandler\0'));
  const head = video ? full('vmhd', 0, 1, zeros(8)) : full('smhd', 0, 0, zeros(4));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const minf = box('minf', head, dinf, stbl(t.entry, t));
  // edts: pula o atraso do codificador (AAC começa com amostras de preparo)
  const parts = [tkhd];
  if (t.skip) parts.push(box('edts', full('elst', 0, 0, u32(1), u32(durMovie), u32(t.skip), u32(0x00010000))));
  parts.push(box('mdia', mdhd, hdlr, minf));
  return box('trak', ...parts);
}

export function mux({ video, audio }) {
  const tracks = [];
  // vídeo: escala de tempo de 1000 por quadro
  const vts = video.fps * 1000, vd = 1000;
  const vs = video.samples;
  let ctts = null;
  if (vs.some(s => s.pts !== undefined)) {
    // quadros B: o deslocamento de composição vem da diferença entre apresentação e decodificação
    const order = vs.map(s => Math.round(s.pts / 1e6 * video.fps));
    const min = Math.min(...order.map((p, i) => p - i));
    const offs = order.map((p, i) => (p - i - min) * vd);
    if (offs.some(o => o !== 0)) {
      ctts = [];
      for (const o of offs) { const l = ctts[ctts.length - 1]; if (l && l[1] === o) l[0]++; else ctts.push([1, o]); }
    }
  }
  const avc1 = box('avc1', zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(video.width), u16(video.height),
    u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff),
    box('avcC', Buffer.from(video.avcC)), box('pasp', u32(1), u32(1)));
  tracks.push({
    kind: 'video', width: video.width, height: video.height, timescale: vts, duration: vs.length * vd, entry: avc1,
    stts: [[vs.length, vd]], ctts, sync: vs.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean),
    sizes: vs.map(s => s.data.length), data: vs.map(s => s.data), secs: i => i / video.fps,
  });
  if (audio && audio.samples.length) {
    const as = audio.samples;
    const esds = full('esds', 0, 0, desc(3, u16(2), u8(0),
      desc(4, u8(0x40), u8(0x15), Buffer.from([0, 0, 0]), u32(audio.bitrate || 192000), u32(audio.bitrate || 192000),
        desc(5, Buffer.from(audio.asc))),
      desc(6, u8(2))));
    const mp4a = box('mp4a', zeros(6), u16(1), zeros(8), u16(audio.channels), u16(16), u16(0), u16(0), u32(audio.rate * 65536), esds);
    tracks.push({
      kind: 'audio', timescale: audio.rate, duration: as.length * 1024, entry: mp4a, stts: [[as.length, 1024]],
      sizes: as.map(s => s.data.length), data: as.map(s => s.data), secs: i => (i * 1024) / audio.rate, skip: audio.skip || 0,
    });
  }
  // pedaços de ~1 s, intercalados por tempo
  for (const t of tracks) {
    t.chunks = [];
    t.data.forEach((d, i) => {
      const sec = Math.floor(t.secs(i));
      const last = t.chunks[t.chunks.length - 1];
      if (last && last.sec === sec) { last.count++; last.items.push(d); } else t.chunks.push({ sec, count: 1, items: [d] });
    });
  }
  const order = tracks.flatMap((t, ti) => t.chunks.map(c => ({ c, ti }))).sort((a, b) => a.c.sec - b.c.sec || a.ti - b.ti);
  const durMovie = Math.round((vs.length / video.fps) * 1000);
  const build = () => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMovie), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(tracks.length + 1)),
    ...tracks.map((t, i) => trak(i + 1, t, durMovie)));
  const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  for (const t of tracks) for (const c of t.chunks) c.offset = 0;
  const moovSize = build().length;
  let off = ftyp.length + moovSize + 8;
  for (const { c } of order) { c.offset = off; off += c.items.reduce((s, d) => s + d.length, 0); }
  const moov = build();
  const mdatBody = order.flatMap(({ c }) => c.items.map(d => Buffer.from(d)));
  const mdatLen = mdatBody.reduce((s, d) => s + d.length, 0) + 8;
  return Buffer.concat([ftyp, moov, u32(mdatLen), str('mdat'), ...mdatBody]);
}
