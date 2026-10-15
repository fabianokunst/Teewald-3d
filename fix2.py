import os
os.chdir(r'C:\Users\fabiano.kunst\Documents\Teewald-3d\src')

def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, (p, old[:80], s.count(old))
        s = s.replace(old, new)
    open(p, 'w', encoding='utf-8', newline='').write(s)

edit('game/lore.js', [
    ("""      { img: 'newsOvelhas', w: 0.6, h: 0.5 },""", """      { img: 'newsOvelhas', w: 0.6, h: 0.44 },"""),
    ("""      { img: 'newsFabrica', w: 0.6, h: 0.5 },""", """      { img: 'newsFabrica', w: 0.6, h: 0.44 },"""),
    ("""      { img: 'fotoMimi', w: 0.34, h: 0.42 },""", """      { img: 'fotoMimi', w: 0.3, h: 0.42, float: 'left' },"""),
    ("""      { img: 'fotoBoris', w: 0.34, h: 0.42 },""", """      { img: 'fotoBoris', w: 0.3, h: 0.42, float: 'left' },"""),
    ("""      { stamp: 'PREFEITURA MUNICIPAL\\nTEEWALD - RS', round: true, color: '#2a4a8a', align: 'left', rot: 0.2 },""",
     """      { stamp: 'PREFEITURA\\nTEEWALD-RS', round: true, float: true, color: '#2a4a8a', align: 'right', rot: 0.2 },"""),
    ("""      { t: 'Einweihung der Kirche, 1910', s: 'ink', size: 18 },
""", """      { t: 'Einweihung der Kirche, 1910', s: 'ink', size: 18 },
      { space: 40 },
"""),
    ("""    ], { paper: 'envelope', label: 'ENVELOPE', marks: ['selo'], blocks: [
      { stamp: 'CORREIOS\\nTEEWALD-RS\\n24 SET', round: true, color: '#2a2a3a', align: 'left', rot: -0.25 },
""", """    ], { paper: 'envelope', marks: ['selo'], postmark: 'CORREIOS\\nTEEWALD-RS\\n24 SET', blocks: [
      { space: 16 },
"""),
    ("""      { img: 'pegada', w: 0.18, h: 0.3, align: 'left' },""", """      { img: 'pegada', w: 0.2, h: 0.4, float: 'left' },"""),
    ("""      { img: 'ervas', w: 0.42, h: 0.26 },""", """      { img: 'ervas', w: 0.42, h: 0.34 },"""),
])

edit('ui/paper.js', [
    ("""      const meta = { paper, marks: pg.marks || (pg.paper ? [] : this.doc.marks || []), label: pg.label || null };""",
     """      const meta = { paper, marks: pg.marks || (pg.paper ? [] : this.doc.marks || []), label: pg.label || null, postmark: pg.postmark || null };"""),
    ("""    this._sheet(g, b, k, a, pal, marks);""", """    this._sheet(g, b, k, a, pal, marks, P.postmark);"""),
    ("""  _sheet(g, b, k, a, pal, marks) {""", """  _sheet(g, b, k, a, pal, marks, postmark) {"""),
    ("""        g.drawImage(art, R(b.x + b.w - art.width * s - 8 * k), R(b.y + 6 * k), art.width * s, art.height * s);""",
     """        const sx = R(b.x + b.w - art.width * s - 8 * k);
        g.drawImage(art, sx, R(b.y + 6 * k), art.width * s, art.height * s);
        // carimbo dos Correios em cima das ondas do selo
        if (postmark) {
          const it = this._items({ stamp: postmark, round: true, color: '#2a2a3a', rot: -0.25, size: 7.5 }, k, b.w, b.h, pal)[0];
          this._stampAt(g, it, sx + 4 * k, b.y + 8 * k + it.r, k, a, pal);
        }"""),
])
print('ok')
