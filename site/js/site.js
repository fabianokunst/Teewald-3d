// Site de Teewald: menu do celular, topo que escurece ao rolar, blocos que surgem, abas,
// filtro da galeria, caixa de foto (galeria e documentos) e a comparação 3D LIMPO x PS1 RETRÔ.
// Tudo funciona sem este arquivo também; ele só deixa a página mais confortável.
(function () {
  document.documentElement.classList.add('js');

  // ---- topo e menu ----
  const topo = document.querySelector('.topo');
  const botaoMenu = document.querySelector('.menu-botao');
  if (topo) {
    const rolou = () => topo.classList.toggle('solido', window.scrollY > 40);
    rolou();
    window.addEventListener('scroll', rolou, { passive: true });
  }
  if (topo && botaoMenu) {
    const abrir = sim => {
      topo.classList.toggle('aberto', sim);
      botaoMenu.setAttribute('aria-expanded', String(sim));
    };
    botaoMenu.addEventListener('click', () => abrir(!topo.classList.contains('aberto')));
    topo.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => abrir(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') abrir(false); });
  }

  // ---- blocos que surgem ao rolar ----
  const surgem = document.querySelectorAll('.surge');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    surgem.forEach(el => io.observe(el));
  } else surgem.forEach(el => el.classList.add('visto'));

  // ---- abas (controles) e filtros (galeria) ----
  document.querySelectorAll('[role="tablist"]').forEach(lista => {
    const abas = [...lista.querySelectorAll('[role="tab"]')];
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
        const alvo = document.getElementById(lista.dataset.galeria);
        alvo.querySelectorAll('.item').forEach(it => {
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

  // ---- caixa de foto ----
  const caixa = document.createElement('dialog');
  caixa.className = 'caixa-foto';
  caixa.setAttribute('aria-label', 'Foto ampliada');
  caixa.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>' +
    '<button class="fechar" type="button">FECHAR ✕</button>' +
    '<button class="passar anterior" type="button" aria-label="Foto anterior">◀</button>' +
    '<button class="passar proxima" type="button" aria-label="Próxima foto">▶</button>';
  const cImg = caixa.querySelector('img'), cLeg = caixa.querySelector('figcaption');
  let grupo = [], atual = 0;
  const mostrar = i => {
    atual = (i + grupo.length) % grupo.length;
    const b = grupo[atual];
    const img = b.querySelector('img');
    cImg.src = b.dataset.grande || img.currentSrc || img.src;
    cImg.alt = img.alt;
    cImg.classList.toggle('pixelado', b.dataset.pixelado !== undefined);
    cLeg.textContent = b.dataset.legenda || img.alt;
    const varios = grupo.length > 1;
    caixa.querySelector('.anterior').hidden = !varios;
    caixa.querySelector('.proxima').hidden = !varios;
  };
  const botoesFoto = document.querySelectorAll('.abre-foto');
  if (botoesFoto.length && typeof caixa.showModal === 'function') {
    document.body.appendChild(caixa);
    botoesFoto.forEach(b => b.addEventListener('click', () => {
      // passa só pelas fotos do mesmo grupo que estão à vista (o filtro da galeria esconde algumas)
      grupo = [...document.querySelectorAll(`.abre-foto[data-grupo="${b.dataset.grupo || ''}"]`)].filter(x => !x.closest('[hidden]'));
      mostrar(grupo.indexOf(b));
      caixa.showModal();
    }));
    caixa.querySelector('.fechar').addEventListener('click', () => caixa.close());
    caixa.querySelector('.anterior').addEventListener('click', () => mostrar(atual - 1));
    caixa.querySelector('.proxima').addEventListener('click', () => mostrar(atual + 1));
    caixa.addEventListener('click', e => { if (e.target === caixa || e.target.tagName === 'FIGURE') caixa.close(); });
    caixa.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' && grupo.length > 1) mostrar(atual + 1);
      if (e.key === 'ArrowLeft' && grupo.length > 1) mostrar(atual - 1);
    });
  }

  // ---- comparação dos estilos visuais ----
  document.querySelectorAll('.comparar').forEach(c => {
    const r = c.querySelector('input[type="range"]');
    const pos = () => c.style.setProperty('--pos', r.value + '%');
    r.addEventListener('input', pos);
    pos();
  });
})();
