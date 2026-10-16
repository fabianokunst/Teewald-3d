<!-- Guia de tradução do Teewald (inglês, espanhol, alemão): regras, tom e glossário.
     Usado por quem traduz (pessoa ou Claude). Veja também CLAUDE.md, seção Tradução. -->

# Teewald — translation guide (EN / ES / DE)

## The game
Third-person horror game with a PS1 look, set in **Teewald**, a fictional version of Santa Maria do
Herval, a small town of German immigrants in Rio Grande do Sul (south Brazil). Autumn, fog, a town
afraid of what walks in the woods. Twelve chapters, each one a Brazilian/German-colonial legend:
the chupacabra, fire dogs, the factory girl ghost (Lúcia), the Varginha aliens, the Beast of the
dawn, phones calling people into the woods, the werewolf (seventh son), the cemetery on All Souls'
Day, the woman in the photograph, vampire bats, and the witch **Otília Kranz** (a healer buried
alive by the colonists in 1878 with an iron cross on top). Townsfolk are old German-Brazilian
colonists: they speak rural gaúcho Portuguese ("tu", "guri", "piá", "cusco", "bah", "tchê") and
drop phrases in **Hunsrik** (a German dialect) or German.

Tone: rural, terse, creepy, sometimes dryly funny. Old people talk plainly. Keep it that way:
no modern slang, no purple prose.

## How to translate
Small changes: run `npm run traduzir` and fill the `''` entries of src/i18n/en.js, es.js and de.js directly
(key = the Portuguese text exactly as in the code; value = the translation; `null` = not player text).

Many texts at once: `npm run traduzir -- --exportar <folder>` writes batches `xx-NN.json` =
`{ lang, itens: { "<id>": { arq, pt } } }`. For each batch write `xx-NN.trad.json` next to it =
`{ "<id>": "<translation>" | null }` with every id (write it with JSON.stringify, never by hand), then
`npm run traduzir -- --importar <folder>`. The `arq` field is the source file: open it for context
(who is speaking, whether it is a button, an item name, a document, a sign).

## Hard rules
1. **Placeholders** `{1}`, `{2}`... must all stay (they are numbers or names inserted by the code).
   They may change order. Never add new ones.
2. Keep `\n` line breaks exactly where they are (same count).
3. **UPPERCASE stays UPPERCASE**; lowercase/sentence case stays so. Keep leading/trailing spaces
   and runs of spaces (e.g. `'CRIATURAS {1}   QUEDAS {2}'` → `'CREATURES {1}   DEATHS {2}'`).
4. Keep punctuation style: ellipses, "(stage directions in parentheses)", quotes, `·`, `—`, `◀▶`, `↑↓`.
5. **Length**: UI labels, buttons, item names and HUD hints must stay about as short as the
   Portuguese (max ~20% longer). Touch buttons (src/engine/touch.js: PULAR, CORRER, GOLPE, ESQUIVA,
   ATIRAR, MIRAR, REC, INV, ARMA, CURA, FALAR, LER, PEGAR, ENTRAR...) must be very short (≤ 7 letters
   when possible; abbreviate like the original does with REC/INV).
6. **Key names in control hints are real keys and must not change**: letters (F, E, I, H, V, C, R,
   M, J, P, Q, WASD, 1-8), ESC, ENTER, SHIFT, TAB, F3, F11, gamepad buttons (A, B, X, Y, RB, LB, L2,
   R2, L3, R3, START, SELECT). Translate only the words around them and the descriptive key names:
   ESPAÇO = SPACE / ESPACIO / LEERTASTE; BOTÃO DIREITO/ESQUERDO = RIGHT/LEFT BUTTON (mouse) /
   BOTÓN DERECHO/IZQUIERDO / RECHTE/LINKE TASTE; RODA = WHEEL / RUEDA / MAUSRAD; DIRECIONAL = D-PAD /
   CRUCETA / STEUERKREUZ; ANALÓGICO = STICK / STICK / STICK; MOUSE / CLIQUE = MOUSE / CLICK;
   PINÇA = PINCH / PELLIZCO / ZWEI FINGER.
   The touch button names inside hints (GOLPE, ESQUIVA, ARMA, ATIRAR, MIRAR, REC, INV, CURA...) must be
   translated exactly like the buttons themselves (see glossary) so the hint matches the button.
7. **Do not translate**: names of people (Paula, Bruno, Erna, Otília Kranz, Lúcia Weber, Hoffmann...),
   proper names of places and businesses (Teewald, Rio Cadeia, Rua Benno Closs, Praça 10 de Abril,
   Banrisul, Sicredi, Supermercado Kunst, Padaria Weber...), the **Kartoffelfest** and the
   **Schützenfest**, and every **Hunsrik / German phrase** (Blutsauger, "die Hex ist wach",
   "Schlaf, Kindlein, schlaf"...) — copy them as they are, also in the German translation.
   Generic words around a name are translated (Igreja Matriz → parish church, Prefeitura → City Hall).
8. If the text is **not something a player reads** (a code id, a file name, a CSS value, a bone
   name, a texture key, an internal label like `Protagonista` in an exporter), answer `null`.
   A lone proper name (e.g. `PAULA`, `Teewald`, `Banrisul`) → copy it unchanged.
9. Texts painted on buildings/signs are still translated normally (it does not hurt).
10. Never leave an item empty; never answer in Portuguese (except names and rule 7).

## Voice per language
- **EN**: natural American English, plain and a little old-fashioned in the mouths of old people.
  Dialogue "tu/você" → "you". Objectives/instructions in the imperative ("Go to the parish church").
- **ES**: Latin American Spanish with **Rioplatense voseo in dialogue** (the town borders Uruguay and
  Argentina: "vos sabés", "mirá", "vení", "che"). Objectives and HUD instructions in the
  **infinitive** ("Ir a la iglesia", "Hablar con el padre Bernardo"); menus as nouns/infinitives.
- **DE**: natural German; dialogue uses "du" (townsfolk are informal and rural; old people may sound
  a bit old-fashioned). Objectives as **infinitive phrases** ("Zur Pfarrkirche gehen",
  "Mit Pfarrer Bernardo sprechen"); menus as nouns/infinitives.

## Glossary (PT → EN | ES | DE)
### People & titles
- Padre Bernardo → Father Bernardo | el padre Bernardo | Pfarrer Bernardo (PADRE BERNARDO → FATHER BERNARDO | PADRE BERNARDO | PFARRER BERNARDO)
- Dona Erna → Dona Erna | doña Erna | Frau Erna
- Seu Bruno → Seu Bruno | don Bruno | Herr Bruno
- Pastor Wendt → Pastor Wendt (all)
- bruxa Otília → the witch Otília | la bruja Otília | die Hexe Otília
- delegado → police chief | comisario | Kommissar
- curandeira → healer | curandera | Heilerin
- colonos → colonists / settlers | colonos | Kolonisten
- guri / piá / piazinho → kid, boy, little one | gurí, gurisito | Junge, Bub, Kleiner
- cusco → mutt | cuzco | Köter
- tchê → pal | che | Mensch
- bah → man / boy | bah | Mensch
- Credo em cruz → Lord have mercy | Ave María purísima | Herrgott nochmal
- barbaridade → good grief | ¡barbaridad! | meine Güte

### Creatures & legends
- chupacabras (o Chupacabras) → the chupacabra | el chupacabras | der Chupacabra
- cães de fogo → fire dogs | perros de fuego | Feuerhunde
- a Moça da Fábrica → the Factory Girl | la Muchacha de la Fábrica | das Mädchen aus der Fabrik
- ETs de Varginha / ETs → the Varginha aliens / aliens | los ET de Varginha / los ET | die Varginha-Aliens / Aliens
- disco voador / nave → flying saucer / ship | plato volador / nave | fliegende Untertasse / Schiff
- a Fera (da madrugada) → the Beast (of the dawn) | la Fiera (de la madrugada) | die Bestie (der Morgendämmerung)
- lobisomem → werewolf | lobisón | Werwolf ; sétimo filho → seventh son | séptimo hijo | siebter Sohn
- a mulher da fotografia → the woman in the photograph | la mujer de la fotografía | die Frau auf dem Foto
- morcegos-vampiro → vampire bats | murciélagos vampiro | Vampirfledermäuse
- almas → souls | almas | Seelen ; fantasma → ghost | fantasma | Geist ; sonâmbulos → sleepwalkers | sonámbulos | Schlafwandler
- criatura(s) / bicho → creature(s) / the beast, the thing | criatura(s) / el bicho | Kreatur(en) / das Biest, das Vieh
- Blutsauger → Blutsauger (keep)

### Places
- Igreja Matriz → the parish church | la iglesia matriz | die Pfarrkirche ; sacristia → sacristy | sacristía | Sakristei ; torre / sino → tower / bell | torre / campana | Turm / Glocke ; coro → choir loft | coro | Empore
- Prefeitura → City Hall | la Municipalidad | das Rathaus ; almoxarifado → storeroom | depósito | Lager
- Sociedade (Sociedade Cultural) → the Sociedade (the town club) — write "the Sociedade" | la Sociedad | die Sociedade (das Vereinshaus) ; sala dos atiradores → shooting club room | sala de los tiradores | Schützenraum
- praça → square | plaza | Platz ; cemitério → cemetery | cementerio | Friedhof ; túmulo → grave | tumba | Grab ; cripta → crypt | cripta | Gruft ; gruta → cave | gruta | Höhle
- fábrica de calçados → shoe factory | fábrica de calzado | Schuhfabrik ; capataz → foreman | capataz | Vorarbeiter
- museu → museum | museo | Museum ; forja → forge | fragua | Schmiede ; mato / mata → the woods | el monte | der Wald
- orelhão → payphone | teléfono público | Telefonzelle (Münztelefon)
- Festa da Batata → Potato Festival | Fiesta de la Papa | Kartoffelfest ; Finados → All Souls' Day | Día de los Difuntos | Allerseelen

### Items & weapons (item names are UPPERCASE in the game)
- PISTOLA 9MM → 9MM PISTOL | PISTOLA 9MM | PISTOLE 9MM ; MUNIÇÃO 9MM → 9MM AMMO | MUNICIÓN 9MM | MUNITION 9MM ; pente → magazine | cargador | Magazin
- ESPINGARDA (de dois canos) → SHOTGUN (double-barreled) | ESCOPETA (de dos caños) | FLINTE (doppelläufig) ; CARTUCHOS 12 → 12-GAUGE SHELLS | CARTUCHOS 12 | SCHROTPATRONEN 12
- REVÓLVER .38 → .38 REVOLVER | REVÓLVER .38 | REVOLVER .38 ; BALAS DE PRATA → SILVER BULLETS | BALAS DE PLATA | SILBERKUGELN
- LAMPIÃO (bento) → LANTERN (blessed) | FAROL (bendito) | LATERNE (geweiht) ; QUEROSENE → KEROSENE | QUEROSENO | PETROLEUM
- PISTOLA DE RAIOS → RAY GUN | PISTOLA DE RAYOS | STRAHLENPISTOLE ; DINAMITE → DYNAMITE | DINAMITA | DYNAMIT ; rifle de dardos → dart rifle | rifle de dardos | Betäubungsgewehr
- CUCA → CUCA (German-Brazilian crumb cake; mention "crumb cake" in descriptions) | CUCA | KUCHEN
- CHÁ DE MARCELA → MARCELA TEA | TÉ DE MARCELA | MARCELA-TEE
- CRUZ DE FERRO → IRON GRAVE CROSS | CRUZ DE HIERRO | EISERNES GRABKREUZ
- MEDALHINHA → MEDALLION | MEDALLITA | MEDAILLE ; SAPATINHO VERMELHO → RED SHOE | ZAPATITO ROJO | ROTER SCHUH
- CARTÃO-PONTO → TIME CARD | TARJETA DE FICHAJE | STEMPELKARTE ; bater o ponto → clock in/out | fichar | stempeln
- CHAVE → KEY | LLAVE | SCHLÜSSEL ; DIÁRIO → DIARY | DIARIO | TAGEBUCH ; COLEIRA → COLLAR | COLLAR | HALSBAND
- melee weapons: SOCO → PUNCH | PUÑETAZO | FAUST ; CORONHADA → PISTOL WHIP | CULATAZO | KOLBENSCHLAG ; PEDAÇO DE PAU → STICK | PALO | KNÜPPEL ; CANO DE FERRO → IRON PIPE | CAÑO DE HIERRO | EISENROHR ; PÁ → SHOVEL | PALA | SCHAUFEL ; FOICE → SCYTHE | GUADAÑA | SENSE ; MACHADO → AXE | HACHA | AXT ; PEDRA → ROCK | PIEDRA | STEIN ; TIJOLO → BRICK | LADRILLO | ZIEGEL

### UI
- NOVO JOGO → NEW GAME | NUEVA PARTIDA | NEUES SPIEL ; CONTINUAR → CONTINUE | CONTINUAR | FORTSETZEN ; CAPÍTULOS → CHAPTERS | CAPÍTULOS | KAPITEL ; OPÇÕES → OPTIONS | OPCIONES | OPTIONEN ; CRÉDITOS → CREDITS | CRÉDITOS | MITWIRKENDE ; ARQUIVOS → FILES | ARCHIVOS | AKTEN ; VOLTAR → BACK | VOLVER | ZURÜCK ; PAUSA → PAUSED | PAUSA | PAUSE ; MENU PRINCIPAL → MAIN MENU | MENÚ PRINCIPAL | HAUPTMENÜ
- IDIOMA / LANGUAGE → LANGUAGE | IDIOMA / LANGUAGE | SPRACHE / LANGUAGE
- CAPÍTULO → CHAPTER | CAPÍTULO | KAPITEL ; CONCLUÍDO → COMPLETE | COMPLETADO | ABGESCHLOSSEN ; OBJETIVO → OBJECTIVE | OBJETIVO | ZIEL
- CRIATURAS → CREATURES | CRIATURAS | KREATUREN ; QUEDAS (times the player fell/died) → DEATHS | MUERTES | TODE ; TEMPO → TIME | TIEMPO | ZEIT ; AVALIAÇÃO → RANK | CALIFICACIÓN | WERTUNG ; BLOQUEADO → LOCKED | BLOQUEADO | GESPERRT ; VIDA → HEALTH | VIDA | LEBEN
- LIGADO/DESLIGADO → ON/OFF | SÍ/NO (or ACTIVADO/DESACTIVADO) | AN/AUS
- Touch / action buttons: PULAR → JUMP | SALTAR | SPRING ; CORRER → RUN | CORRER | RENNEN ; GOLPE → STRIKE | GOLPE | SCHLAG ; ESQUIVA → DODGE | ESQUIVA | AUSW. ; ATIRAR → SHOOT | DISPARAR | FEUER ; MIRAR → AIM | APUNTAR | ZIELEN ; REC → REL | REC | NACHL ; INV → INV | INV | INV ; ARMA → WEAPON | ARMA | WAFFE ; CURA → HEAL | CURAR | HEILEN ; FALAR → TALK | HABLAR | REDEN ; LER → READ | LEER | LESEN ; PEGAR → TAKE | TOMAR | NEHMEN ; ENTRAR → ENTER | ENTRAR | BETRETEN ; SAIR → EXIT | SALIR | RAUS ; EXAMINAR → EXAMINE | EXAMINAR | UNTERSUCHEN ; ABRIR → OPEN | ABRIR | ÖFFNEN ; USAR → USE | USAR | BENUTZEN ; (SEGURE) → (HOLD) | (MANTENER) | (HALTEN)
- PROGRESSO SALVO → PROGRESS SAVED | PROGRESO GUARDADO | FORTSCHRITT GESPEICHERT
