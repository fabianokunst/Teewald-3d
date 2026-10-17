// Site de Teewald: o comportamento das páginas. Tudo aqui é enfeite: sem este arquivo o
// conteúdo aparece inteiro e parado (o <head> só esconde o que anima quando ele roda).
//   topo        escurece ao rolar, some ao descer e volta ao subir; menu do celular
//   progresso   barra fina no alto com quanto da página já foi lido
//   capa        a entrada (letras que acendem, texto digitado), o mouse mexendo as camadas,
//               relâmpagos e os olhos vermelhos que aparecem no escuro e fogem do mouse
//   faixa       a entrada do cabeçalho das páginas internas
//   revelar     [data-revela] e [data-revela-filhos] aparecem ao entrar na tela
//   paralaxe    [data-paralaxe="0.2"] anda mais devagar que a página
//   lanterna    .chamada: o facho segue o mouse (no toque, passeia sozinho)
//   brilho      cartões e fichas acendem onde o mouse está
//   contadores  [data-conta] sobe até o número quando aparece
//   manchetes   o letreiro de notícias passa sem emenda
//   abas, galeria, caixa de foto e comparação 3D LIMPO x PS1 RETRÔ
(function () {
  const raiz = document.documentElement;
  raiz.classList.add('js');
  window.__siteOk = true;
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toque = matchMedia('(hover: none)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sorte = (a, b) => a + Math.random() * (b - a);

  // ---- digitação: troca o texto por letras que aparecem uma a uma (o texto inteiro fica para o leitor de tela)
  function prepararDigitacao(el) {
    const texto = el.textContent.trim().replace(/\s+/g, ' ');
    let i = 0;
    const palavras = texto.split(' ').map(p => `<span class="pal">${[...p].map(c => `<span class="c" style="--i:${i++}">${c}</span>`).join('')}</span>`);
    el.innerHTML = `<span class="so-leitor">${texto}</span><span aria-hidden="true">${palavras.join(' ')}</span>`;
    el.classList.add('digitando');
    return i;
  }
  function digitar(el, atraso, vel) {
    const n = prepararDigitacao(el);
    el.style.setProperty('--d0', atraso + 'ms');
    el.style.setProperty('--dv', vel + 'ms');
    el.style.setProperty('--dfim', atraso + n * vel + 150 + 'ms');
    requestAnimationFrame(() => el.classList.add('vai'));
  }
  // palavras que sobem de dentro de uma máscara (títulos das faixas)
  function separarPalavras(el) {
    const texto = el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('aria-label', texto);
    el.innerHTML = texto.split(' ').map((p, i) => `<span class="pal" aria-hidden="true"><span style="--i:${i}">${p}</span></span>`).join(' ');
  }

  // ---- topo e menu
  const topo = $('.topo');
  const botaoMenu = $('.menu-botao');
  if (topo) {
    $$('.menu a', topo).forEach((a, i) => a.style.setProperty('--i', i));
    if (botaoMenu) {
      const abrir = sim => { topo.classList.toggle('aberto', sim); botaoMenu.setAttribute('aria-expanded', String(sim)); };
      botaoMenu.addEventListener('click', () => abrir(!topo.classList.contains('aberto')));
      $$('.menu a', topo).forEach(a => a.addEventListener('click', () => abrir(false)));
      document.addEventListener('keydown', e => { if (e.key === 'Escape') abrir(false); });
    }
  }

  // ---- rolagem: topo, progresso, capa e paralaxe num quadro só
  const progresso = document.createElement('div');
  progresso.className = 'progresso';
  progresso.setAttribute('aria-hidden', 'true');
  document.body.prepend(progresso);
  const capa = $('[data-capa]');
  const paralaxes = calmo ? [] : $$('[data-paralaxe]').map(el => ({ el, k: parseFloat(el.dataset.paralaxe) || 0.2, ver: false }));
  if ('IntersectionObserver' in window && paralaxes.length) {
    const io = new IntersectionObserver(es => es.forEach(e => { paralaxes.find(p => p.el === e.target).ver = e.isIntersecting; }), { rootMargin: '20% 0px' });
    paralaxes.forEach(p => io.observe(p.el));
  }
  let ultimoY = window.scrollY, pedido = false;
  function aoRolar() {
    pedido = false;
    const y = window.scrollY, vh = window.innerHeight;
    if (topo) {
      topo.classList.toggle('solido', y > 40);
      if (Math.abs(y - ultimoY) > 6) topo.classList.toggle('escondido', y > ultimoY && y > vh * 0.6);
    }
    ultimoY = y;
    const total = document.documentElement.scrollHeight - vh;
    progresso.style.setProperty('--p', total > 0 ? Math.min(1, y / total).toFixed(4) : 0);
    if (capa && !calmo) capa.style.setProperty('--rolagem', Math.min(1, y / (capa.offsetHeight * 0.85)).toFixed(3));
    for (const p of paralaxes) {
      if (!p.ver) continue;
      const r = p.el.parentElement.getBoundingClientRect();
      const meio = (r.top + r.height / 2 - vh / 2) / vh;
      p.el.style.transform = `translate3d(0, ${(meio * p.k * 100).toFixed(1)}px, 0)`;
    }
  }
  const pedir = () => { if (!pedido) { pedido = true; requestAnimationFrame(aoRolar); } };
  window.addEventListener('scroll', pedir, { passive: true });
  window.addEventListener('resize', pedir);
  aoRolar();

  // ---- capa
  if (capa) {
    const logo = $('.capa-logo', capa);
    const texto = logo.textContent.trim();
    logo.setAttribute('aria-label', texto);
    logo.innerHTML = [...texto].map((c, i) => `<span class="letra" aria-hidden="true" style="--i:${i}">${c}</span>`).join('');
    $$('.hud i', capa).forEach((el, n) => el.style.setProperty('--n', n));
    const rotulo = $('.capa-rotulo', capa), frase = $('.capa-frase', capa);
    let entrou = false;
    const entrar = () => {
      if (entrou) return;
      entrou = true;
      capa.classList.add('entrou');
      if (calmo) return;
      if (rotulo) digitar(rotulo, 420, 22);
      if (frase) digitar(frase, 1850, 45);
      setTimeout(ambiente, 6000);
    };
    const img = $('.capa-fundo img', capa);
    const pronta = img && img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    Promise.race([pronta, new Promise(r => setTimeout(r, 1200))]).then(() => requestAnimationFrame(entrar));

    // o mouse mexe as camadas (a foto, a neblina) em profundidades diferentes
    if (!calmo && !toque) {
      capa.addEventListener('pointermove', e => {
        const r = capa.getBoundingClientRect();
        capa.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 2 - 1).toFixed(3));
        capa.style.setProperty('--my', ((e.clientY - r.top) / r.height * 2 - 1).toFixed(3));
      });
      capa.addEventListener('pointerleave', () => { capa.style.setProperty('--mx', 0); capa.style.setProperty('--my', 0); });
    }

    // relâmpagos de vez em quando e, no escuro, um par de olhos vermelhos que some se o mouse chega perto
    const olhos = $('.capa-olhos', capa);
    // cantos escuros da foto da capa (no celular o texto ocupa a parte de baixo)
    const cantos = innerWidth < 760 ? [[74, 18], [86, 26], [62, 13], [90, 34]] : [[84, 66], [90, 54], [76, 72], [95, 70], [70, 60]];
    let mouse = { x: -1e4, y: -1e4 };
    capa.addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY }; });
    function ambiente() {
      const relampago = () => {
        if (window.scrollY < capa.offsetHeight) {
          capa.classList.remove('relampago'); void capa.offsetWidth; capa.classList.add('relampago');
        }
        setTimeout(relampago, sorte(14000, 28000));
      };
      setTimeout(relampago, sorte(3000, 9000));
      if (!olhos) return;
      const aparecer = () => {
        if (window.scrollY < capa.offsetHeight * 0.5) {
          const [x, y] = cantos[Math.floor(Math.random() * cantos.length)];
          olhos.style.setProperty('--ox', x + '%');
          olhos.style.setProperty('--oy', y + '%');
          const dur = sorte(2600, 4200);
          olhos.style.setProperty('--dur-olhos', dur + 'ms');
          olhos.classList.remove('olhando', 'fugiu'); void olhos.offsetWidth; olhos.classList.add('olhando');
          const vigia = setInterval(() => {
            const r = olhos.getBoundingClientRect();
            if (Math.hypot(mouse.x - r.left, mouse.y - r.top) < 170) { olhos.classList.remove('olhando'); olhos.classList.add('fugiu'); clearInterval(vigia); }
          }, 80);
          setTimeout(() => clearInterval(vigia), dur);
        }
        setTimeout(aparecer, sorte(8000, 15000));
      };
      setTimeout(aparecer, sorte(1500, 4000));
    }
  }

  // ---- faixa das páginas internas
  const faixa = $('.faixa[data-entra]');
  if (faixa) {
    const h1 = $('h1', faixa);
    if (h1) separarPalavras(h1);
    const rot = $('.rotulo', faixa);
    const img = $('.faixa-fundo img', faixa);
    const pronta = img && img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    Promise.race([pronta, new Promise(r => setTimeout(r, 900))]).then(() => requestAnimationFrame(() => {
      faixa.classList.add('entrou');
      if (rot && !calmo) digitar(rot, 150, 26);
    }));
  }

  // ---- revelar ao rolar
  const revelaveis = $$('[data-revela], [data-revela-filhos]');
  revelaveis.forEach(el => {
    if (el.hasAttribute('data-revela-filhos')) [...el.children].forEach((f, i) => f.style.setProperty('--i', i % 8));
    if (el.matches('.tempo')) [...el.children].forEach((f, i) => f.style.setProperty('--i', i));
  });
  if ('IntersectionObserver' in window && !calmo) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('visto');
      io.unobserve(e.target);
      if (e.target.matches('.comparar')) dicaComparar(e.target);
    }), { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    revelaveis.forEach(el => io.observe(el));
  } else revelaveis.forEach(el => el.classList.add('visto'));

  // ---- contadores
  const contadores = $$('[data-conta]');
  const contar = el => {
    const fim = parseFloat(el.dataset.conta), t0 = performance.now(), dur = 1600;
    const passo = t => {
      const k = Math.min(1, (t - t0) / dur), v = Math.round(fim * (1 - Math.pow(1 - k, 4)));
      el.textContent = v;
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  };
  if ('IntersectionObserver' in window && !calmo) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { contar(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
    contadores.forEach(el => { el.textContent = '0'; io.observe(el); });
  }

  // ---- lanterna nas chamadas
  $$('.chamada').forEach(sec => {
    if (calmo) return;
    let ativo = false, noMouse = false, t = Math.random() * 10, ultimo = 0;
    const pos = (x, y) => { sec.style.setProperty('--x', x); sec.style.setProperty('--y', y); };
    sec.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      noMouse = true;
      const r = sec.getBoundingClientRect();
      pos(e.clientX - r.left + 'px', e.clientY - r.top + 'px');
    });
    sec.addEventListener('pointerleave', () => { noMouse = false; });
    // sem mouse em cima, o facho passeia devagar pela foto
    const passear = agora => {
      if (!ativo) return;
      const dt = Math.min(0.05, (agora - (ultimo || agora)) / 1000); ultimo = agora;
      if (!noMouse) {
        t += dt;
        pos((50 + Math.sin(t * 0.45) * 30).toFixed(2) + '%', (46 + Math.sin(t * 0.71 + 1.3) * 22).toFixed(2) + '%');
      }
      requestAnimationFrame(passear);
    };
    new IntersectionObserver(es => es.forEach(e => {
      ativo = e.isIntersecting;
      if (ativo) { ultimo = 0; requestAnimationFrame(passear); }
    })).observe(sec);
  });

  // ---- brilho de lanterna nos cartões
  if (!toque) {
    document.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.cartao, .ficha, .trancada');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', e.clientX - r.left + 'px');
      c.style.setProperty('--my', e.clientY - r.top + 'px');
    }, { passive: true });
  }

  // ---- manchetes: duplica o trilho para emendar a volta
  $$('.manchetes-trilho').forEach(tr => {
    [...tr.children].forEach(f => { const c = f.cloneNode(true); c.setAttribute('aria-hidden', 'true'); tr.appendChild(c); });
  });

  // ---- abas (controles) e filtros (galeria)
  $$('[role="tablist"]').forEach(lista => {
    const abas = $$('[role="tab"]', lista);
    const escolher = aba => {
      abas.forEach(a => {
        const sim = a === aba;
        a.setAttribute('aria-selected', String(sim));
        a.tabIndex = sim ? 0 : -1;
        const painel = a.getAttribute('aria-controls') && document.getElementById(a.getAttribute('aria-controls'));
        if (painel) painel.hidden = !sim;
      });
      const filtro = aba.dataset.filtro;
      if (filtro !== undefined) {
        $$('.item', document.getElementById(lista.dataset.galeria)).forEach(it => {
          it.hidden = filtro !== 'todas' && !(it.dataset.tags || '').split(' ').includes(filtro);
        });
      }
    };
    abas.forEach((a, i) => {
      a.addEventListener('click', () => escolher(a));
      a.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        const prox = abas[(i + d + abas.length) % abas.length];
        prox.focus(); escolher(prox);
      });
    });
  });

  // ---- idioma (os mesmos do jogo): textos deste arquivo, seletor do topo e aviso de idioma
  // O aviso aparece uma vez para quem chega numa página em outro idioma que não o seu: o que
  // escolheu no jogo (mesmo endereço, teewald.settings.v1) ou, sem isso, o do navegador.
  // Escolher um idioma (no seletor ou no aviso) ou fechar o aviso fica guardado.
  const TEXTOS = {
    pt: { foto: 'Foto ampliada', fechar: 'FECHAR ✕', anterior: 'Foto anterior', proxima: 'Próxima foto', fecharAviso: 'Fechar' },
    en: { foto: 'Enlarged photo', fechar: 'CLOSE ✕', anterior: 'Previous photo', proxima: 'Next photo', fecharAviso: 'Close' },
    es: { foto: 'Foto ampliada', fechar: 'CERRAR ✕', anterior: 'Foto anterior', proxima: 'Foto siguiente', fecharAviso: 'Cerrar' },
    de: { foto: 'Vergrößertes Foto', fechar: 'SCHLIESSEN ✕', anterior: 'Vorheriges Foto', proxima: 'Nächstes Foto', fecharAviso: 'Schließen' },
  };
  const SUGESTAO = {
    pt: ['Este site também está em português.', 'Ler em português'],
    en: ['This site is also in English.', 'Read in English'],
    es: ['Este sitio también está en español.', 'Leer en español'],
    de: ['Diese Seite gibt es auch auf Deutsch.', 'Auf Deutsch lesen'],
  };
  const lingua = (raiz.lang || 'pt').slice(0, 2).toLowerCase();
  const textos = TEXTOS[lingua] || TEXTOS.pt;
  const memoria = {
    ler() { try { return localStorage.getItem('teewald.site.idioma'); } catch (e) { return null; } },
    guardar(l) { try { localStorage.setItem('teewald.site.idioma', l); } catch (e) { /* sem armazenamento: o aviso volta */ } },
  };
  function idiomaDoVisitante() {
    try {
      const jogo = JSON.parse(localStorage.getItem('teewald.settings.v1') || '{}');
      if (TEXTOS[jogo.lang]) return jogo.lang;
    } catch (e) { /* sem jogo salvo */ }
    for (const l of navigator.languages?.length ? navigator.languages : [navigator.language || '']) {
      const id = String(l).slice(0, 2).toLowerCase();
      if (TEXTOS[id]) return id;
    }
    return 'en';
  }
  const seletor = $('.idiomas');
  $$('a[hreflang]').forEach(a => a.addEventListener('click', () => memoria.guardar(a.hreflang)));
  if (seletor) {
    document.addEventListener('click', e => { if (seletor.open && !seletor.contains(e.target)) seletor.open = false; });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && seletor.open) { seletor.open = false; $('summary', seletor).focus(); }
    });
  }
  const sugerido = idiomaDoVisitante();
  const destino = seletor && $(`a[hreflang="${sugerido}"]`, seletor);
  if (destino && sugerido !== lingua && !memoria.ler() && !navigator.webdriver) {
    const [frase, acao] = SUGESTAO[sugerido];
    const aviso = document.createElement('div');
    aviso.className = 'aviso-idioma';
    aviso.setAttribute('role', 'region');
    aviso.setAttribute('aria-label', 'Idioma / Language');
    aviso.innerHTML = `<p lang="${destino.lang}">${frase}</p>` +
      `<a class="botao botao-pequeno" href="${destino.getAttribute('href')}" hreflang="${sugerido}" lang="${destino.lang}">${acao}</a>` +
      `<button class="fechar-aviso" type="button" aria-label="${textos.fecharAviso}">✕</button>`;
    document.body.appendChild(aviso);
    $('a', aviso).addEventListener('click', () => memoria.guardar(sugerido));
    $('button', aviso).addEventListener('click', () => { memoria.guardar(lingua); aviso.remove(); });
  }

  // ---- caixa de foto
  const caixa = document.createElement('dialog');
  caixa.className = 'caixa-foto';
  caixa.setAttribute('aria-label', textos.foto);
  caixa.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>' +
    `<button class="fechar" type="button">${textos.fechar}</button>` +
    `<button class="passar anterior" type="button" aria-label="${textos.anterior}">◀</button>` +
    `<button class="passar proxima" type="button" aria-label="${textos.proxima}">▶</button>`;
  const cImg = $('img', caixa), cLeg = $('figcaption', caixa);
  let grupo = [], atual = 0;
  const mostrar = i => {
    atual = (i + grupo.length) % grupo.length;
    const b = grupo[atual], img = $('img', b);
    cImg.style.animation = 'none'; void cImg.offsetWidth; cImg.style.animation = '';
    cImg.src = b.dataset.grande || img.currentSrc || img.src;
    cImg.alt = img.alt;
    cImg.classList.toggle('pixelado', b.dataset.pixelado !== undefined);
    cLeg.textContent = b.dataset.legenda || img.alt;
    $('.anterior', caixa).hidden = $('.proxima', caixa).hidden = grupo.length < 2;
  };
  const botoesFoto = $$('.abre-foto');
  if (botoesFoto.length && typeof caixa.showModal === 'function') {
    document.body.appendChild(caixa);
    botoesFoto.forEach(b => b.addEventListener('click', () => {
      // passa só pelas fotos do mesmo grupo que estão à vista (o filtro da galeria esconde algumas)
      grupo = $$(`.abre-foto[data-grupo="${b.dataset.grupo || ''}"]`).filter(x => !x.closest('[hidden]'));
      mostrar(grupo.indexOf(b));
      caixa.showModal();
    }));
    $('.fechar', caixa).addEventListener('click', () => caixa.close());
    $('.anterior', caixa).addEventListener('click', () => mostrar(atual - 1));
    $('.proxima', caixa).addEventListener('click', () => mostrar(atual + 1));
    caixa.addEventListener('click', e => { if (e.target === caixa || e.target.tagName === 'FIGURE') caixa.close(); });
    caixa.addEventListener('keydown', e => {
      if (grupo.length < 2) return;
      if (e.key === 'ArrowRight') mostrar(atual + 1);
      if (e.key === 'ArrowLeft') mostrar(atual - 1);
    });
  }

  // ---- comparação dos estilos visuais (ao aparecer, a divisória balança uma vez para mostrar que mexe)
  $$('.comparar').forEach(c => {
    const r = $('input[type="range"]', c);
    const pos = () => c.style.setProperty('--pos', r.value + '%');
    r.addEventListener('input', () => { c.dataset.mexeu = '1'; pos(); });
    pos();
  });
  function dicaComparar(c) {
    const r = $('input[type="range"]', c), t0 = performance.now();
    const passo = t => {
      if (c.dataset.mexeu) return;
      const k = Math.min(1, (t - t0) / 2200);
      r.value = 50 + Math.sin(k * Math.PI * 2) * 18 * (1 - k);
      c.style.setProperty('--pos', r.value + '%');
      if (k < 1) requestAnimationFrame(passo);
    };
    setTimeout(() => requestAnimationFrame(passo), 700);
  }

  // ---- página do sistema visual: tocar de novo as demonstrações de movimento
  $$('[data-tocar]').forEach(b => b.addEventListener('click', () => {
    const alvo = document.getElementById(b.dataset.tocar);
    alvo.classList.remove('tocando'); void alvo.offsetWidth; alvo.classList.add('tocando');
  }));
})();
