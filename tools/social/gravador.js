// Gravador do reels (roda dentro da página do jogo; npm run social -- reels).
// Cada quadro: a cena ajeita câmera e personagens, o relógio (relogio.js) avança 1/30 s e
// roda um quadro do jogo, a imagem vai para uma tela 2D (letreiros por cima) e dali para o
// VideoEncoder. O som é o do próprio jogo: o motor de áudio troca o AudioContext por um
// OfflineAudioContext que para a cada quadro (suspend), então cada tiro, sino e trovão
// cai exatamente no quadro em que aconteceu.
window.__gravador = {
  // roteiro: [{ dur, prep(T, G), quadro(t, dt, G), letreiros: [{ img, alfa(t), sobe }], escuro(t), filtro }]
  // (t = segundos desde o começo da cena; G = estado que as cenas dividem)
  // o: { w, h, fps, bitrate, volume, ganhoMax, letreiros: { nome: dataURL } }; os pedaços
  // codificados voltam ao Node por window.__envia (page.exposeFunction)
  async grava(roteiro, o) {
    const T = window.__teewald, R = window.__rec;
    const W = o.w, H = o.h, FPS = o.fps || 30, RATE = 48000;
    const total = roteiro.reduce((s, c) => s + c.dur, 0), N = Math.round(total * FPS);
    const imgs = {};
    for (const [k, src] of Object.entries(o.letreiros || {})) {
      const im = new Image(); im.src = src; await im.decode(); imgs[k] = im;
    }
    // ---- som: o jogo passa a tocar num contexto offline
    const oac = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil((total + 0.2) * RATE), sampleRate: RATE });
    const A = T.audio;
    if (A.ctx) { try { A.ctx.close(); } catch (e) { /* já fechado */ } }
    A.ctx = null;
    const Real = window.AudioContext;
    window.AudioContext = function () { return oac; };
    try { A.start(); } finally { window.AudioContext = Real; }
    A.setVolume(o.volume ?? 0.8);
    A.setAmbience(true);
    A.nextOmen = 999;   // os sinais ao longe tocam quando o roteiro mandar
    A.setTension = () => {};
    A.tension = { k: 0, boss: 0 };
    // ---- vídeo
    const tela = document.createElement('canvas'); tela.width = W; tela.height = H;
    const g = tela.getContext('2d', { alpha: false });
    const video = { samples: [], avcC: null };
    const enc = new VideoEncoder({
      output: (ch, meta) => {
        if (meta?.decoderConfig?.description && !video.avcC) video.avcC = new Uint8Array(meta.decoderConfig.description);
        const d = new Uint8Array(ch.byteLength); ch.copyTo(d);
        video.samples.push({ data: d, key: ch.type === 'key', pts: ch.timestamp });
      },
      error: e => { throw e; },
    });
    enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: o.bitrate || 14e6, framerate: FPS, latencyMode: 'quality', avc: { format: 'avc' } });
    const gl = T.renderer.gl.domElement;
    // ---- cenas
    const inicio = []; let acc = 0;
    for (const c of roteiro) { inicio.push(acc); acc += c.dur; }
    const G = { imgs, oac, A };   // estado compartilhado entre as cenas
    let atual = -1, vazios = 0;
    R.start();
    // o próximo quadro do jogo já pedido ao navegador entra na fila do relógio
    while (!R.q.length) await new Promise(r => setTimeout(r, 10));
    const quadro = async k => {
      const t = k / FPS;
      let i = roteiro.length - 1;
      while (i > 0 && inicio[i] > t + 1e-6) i--;
      const c = roteiro[i], tl = t - inicio[i];
      if (i !== atual) { atual = i; await c.prep?.(T, G); }
      c.quadro?.(tl, 1 / FPS, G);
      if (!R.q.length) vazios++;   // nenhum quadro do jogo esperando: a imagem sairia repetida
      R.step(1000 / FPS);
      c.depois?.(tl, G);
      g.globalAlpha = 1; g.filter = c.filtro || 'none';
      g.drawImage(gl, 0, 0, W, H);
      g.filter = 'none';
      const esc = c.escuro ? c.escuro(tl) : 0;
      if (esc > 0) { g.globalAlpha = Math.min(1, esc); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
      for (const L of c.letreiros || []) {
        const a = L.alfa(tl);
        if (a <= 0.003) continue;
        g.globalAlpha = Math.min(1, a);
        const dy = L.sobe ? (1 - Math.min(1, a)) * L.sobe : 0;
        g.drawImage(imgs[L.img], 0, dy, W, H);
      }
      g.globalAlpha = 1;
      const f = new VideoFrame(tela, { timestamp: Math.round(k * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(f, { keyFrame: k % (FPS * 2) === 0 });
      f.close();
      while (enc.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 4));
      if (k % FPS === 0) console.log(`[rec] ${k / FPS}/${Math.round(total)} s`);
    };
    // quadro 0 antes de começar; depois, um quadro a cada parada do som
    await quadro(0);
    const fim = new Promise((ok, falha) => {
      let k = 1;
      const passo = async () => {
        try {
          await quadro(k); k++;
          if (k < N) oac.suspend(k / FPS).then(passo);
          oac.resume();
        } catch (e) { falha(e); }
      };
      oac.suspend(1 / FPS).then(passo);
      oac.startRendering().then(ok, falha);
    });
    const som = await fim;
    R.stop();
    await enc.flush(); enc.close();
    // conferência: decodifica o próprio vídeo e mede o brilho médio de um quadro por segundo
    const luz = [];
    const mini = document.createElement('canvas'); mini.width = 27; mini.height = 48;
    const mg = mini.getContext('2d', { willReadFrequently: true });
    const dec = new VideoDecoder({
      output: f => {
        const k = Math.round(f.timestamp * FPS / 1e6);
        if (k % FPS === 0) {
          mg.drawImage(f, 0, 0, 27, 48);
          const d = mg.getImageData(0, 0, 27, 48).data;
          let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
          luz[k / FPS] = Math.round(s / (d.length / 4) / 3);
        }
        f.close();
      },
      error: e => luz.push('erro: ' + e.message),
    });
    dec.configure({ codec: 'avc1.640028', codedWidth: W, codedHeight: H, description: video.avcC });
    for (const s of video.samples) dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.pts, data: s.data }));
    await dec.flush(); dec.close();
    // ---- som: normaliza (pico a -1 dBFS, com teto de ganho) e codifica em AAC
    const ch = [som.getChannelData(0), som.getChannelData(1)];
    const len = Math.round(total * RATE);
    let pico = 0;
    for (const c of ch) for (let i = 0; i < len; i++) pico = Math.max(pico, Math.abs(c[i]));
    const ganho = Math.min(o.ganhoMax ?? 4, 0.89 / (pico || 1));
    const audio = { samples: [], asc: null, rate: RATE, channels: 2, bitrate: 192000, ts: [] };
    const aenc = new AudioEncoder({
      output: (c, meta) => {
        if (meta?.decoderConfig?.description && !audio.asc) audio.asc = new Uint8Array(meta.decoderConfig.description);
        const d = new Uint8Array(c.byteLength); c.copyTo(d);
        audio.samples.push({ data: d }); audio.ts.push(c.timestamp);
      },
      error: e => { throw e; },
    });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 });
    const BL = 1024;
    for (let i = 0; i < len; i += BL) {
      const n = Math.min(BL, len - i), buf = new Float32Array(n * 2);
      for (let j = 0; j < n; j++) { buf[j] = ch[0][i + j] * ganho; buf[n + j] = ch[1][i + j] * ganho; }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / RATE * 1e6), data: buf });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
    // ---- manda os pedaços para o Node (base64, um a um)
    const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    for (const [i, s] of video.samples.entries()) await window.__envia('v', i, b64(s.data), s.key, s.pts);
    for (const [i, s] of audio.samples.entries()) await window.__envia('a', i, b64(s.data), true, audio.ts[i]);
    return { quadros: video.samples.length, avcC: b64(video.avcC), asc: b64(audio.asc), pico, ganho, aacInicio: audio.ts.slice(0, 3), luz, vazios };
  },
};
