// Relógio controlado para gravar o reels quadro a quadro (npm run social).
// Entra na página antes do jogo (evaluateOnNewDocument). Enquanto __rec.manual estiver
// ligado, requestAnimationFrame e performance.now param de seguir o relógio de verdade:
// cada __rec.step(ms) avança o tempo e roda um quadro do jogo. Assim o vídeo sai liso
// a 30 quadros por segundo por mais pesada que seja a cena.
(() => {
  const realRAF = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const R = window.__rec = { manual: false, t: 0, q: [] };
  performance.now = () => (R.manual ? R.t : realNow());
  window.requestAnimationFrame = cb => {
    if (R.manual) { R.q.push(cb); return 0; }
    return realRAF(ts => (R.manual ? R.q.push(cb) : cb(ts)));
  };
  R.start = () => { R.t = realNow(); R.manual = true; };
  R.step = ms => { R.t += ms; const q = R.q; R.q = []; for (const cb of q) cb(R.t); };
  R.stop = () => { R.manual = false; const q = R.q; R.q = []; for (const cb of q) realRAF(cb); };
})();
