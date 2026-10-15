import os, re
os.chdir(r'C:\Users\fabiano.kunst\Documents\Teewald-3d\src')

def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, (p, old[:80], s.count(old))
        s = s.replace(old, new)
    open(p, 'w', encoding='utf-8', newline='').write(s)

# foto de jornal: tons de cinza na cor do papel-jornal, com grão (escala bem em qualquer resolução)
s = open('game/docArt.js', encoding='utf-8').read()
i = s.index('function halftone(F, pal, o) {')
j = s.index('// borda branca de foto;')
s = s[:i] + s[j:]
open('game/docArt.js', 'w', encoding='utf-8', newline='').write(s)
edit('game/docArt.js', [
    ("""// retícula de jornal: tinta preta no papel (a mesma cor do papel 'news' em ui/paper.js)
const NEWS = v => (v ? [212, 207, 194] : [38, 36, 34]);""",
     """// foto de jornal: tinta preta no papel-jornal (a mesma cor do papel 'news' em ui/paper.js)
const NEWS = v => [38 + 174 * v, 36 + 171 * v, 34 + 160 * v];"""),
    ("""// retícula de jornal: pontos que crescem do centro (no dobro da resolução do filme)
const DOTS = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14].map(v => (v + 0.5) / 16);
""", ""),
    ("""  if (o.halftone) return halftone(F, pal, o);
""", ""),
    ("""// o: { grain, vignette, halftone, lift (tira o preto puro), scratches, seed }""",
     """// o: { grain, vignette, lift (tira o preto puro), scratches, seed }"""),
    ("""  return develop(F, NEWS, { halftone: true, seed: 32 });""", """  return develop(F, NEWS, { grain: 0.16, vignette: 0.2, seed: 32 });"""),
    ("""  return develop(F, NEWS, { halftone: true, seed: 84 });""", """  return develop(F, NEWS, { grain: 0.16, vignette: 0.2, seed: 84 });"""),
])

edit('game/lore.js', [
    ("""      { t: 'Folha de Teewald', s: 'mast', align: 'center' },
      { t: 'SÁBADO, 3 DE OUTUBRO  ·  O JORNAL DO HERVAL', s: 'small', align: 'center' },
      { rule: true },""", """      { t: 'Folha de Teewald', s: 'mast', align: 'center' },
      { rule: true },"""),
    ("""      { t: 'Folha de Teewald', s: 'mast', align: 'center' },
      { t: 'SEXTA-FEIRA, 18 DE NOVEMBRO DE 1983', s: 'small', align: 'center' },
      { rule: true },""", """      { t: 'Folha de Teewald', s: 'mast', align: 'center' },
      { rule: true },"""),
    ("""      { img: 'newsOvelhas', w: 0.6, h: 0.34 },""", """      { img: 'newsOvelhas', w: 0.6, h: 0.5 },"""),
    ("""      { img: 'newsFabrica', w: 0.6, h: 0.34 },""", """      { img: 'newsFabrica', w: 0.6, h: 0.5 },"""),
])
print('ok')
