// Tutorial del contramaestre.
//  1) Guía paso a paso de lo básico: explica, resalta el botón que hay que usar y espera a que lo hagas.
//  2) Explicaciones sueltas que aparecen una sola vez: al desbloquear algo con investigación,
//     al elegir un edificio por primera vez, en el primer asalto, etc.
// Estado guardado: S.tutN (paso de la guía), S.tips (explicaciones ya vistas), S.tutOff (apagado).
(function (PV) {
  'use strict';
  const D = PV.D;
  const $ = id => document.getElementById(id);
  const owned = S => S.islands.filter(i => i.owned);
  const anyB = (S, type) => owned(S).some(i => i.buildings.some(b => D.base(b.type) === type));
  const stored = S => owned(S).reduce((t, i) => t + PV.Inv.storageTotal(i), 0);
  const isl = () => PV.scene === 'island';
  const bar = (...ks) => isl() ? ks.map(k => `#buildbar button[data-b="${k}"]`).concat(`#buildcats button[data-cat="${D.BUILD[ks[0]].cat}"]`) : [];
  const notOnIsland = '<br><i>(Volvé a tu isla para hacerlo.)</i>';

  // ---------- Guía paso a paso ----------
  // t: texto, h: ayuda, hl: qué resaltar, info: se avanza con «Siguiente», done: cuándo se cumple.
  const STEPS = [
    { info: true, t: '¡Bienvenido a bordo, capitán! Soy tu <b>contramaestre</b>. Te voy a enseñar a armar tu colonia pirata.',
      h: 'Cuando quieras me podés ocultar; después me volvés a llamar con el botón 🧔.',
      done: S => owned(S).some(i => i.buildings.length) },
    { t: 'Navegá hasta <b>Isla Refugio</b>, la que tiene tu bandera.',
      h: '<kbd>W</kbd> / <kbd>S</kbd> suben y bajan las velas, <kbd>A</kbd> / <kbd>D</kbd> mueven el timón. La rueda del mouse hace zoom.',
      done: S => (PV.Sea.near && PV.Sea.near.home) || isl() || owned(S).some(i => i.buildings.length) },
    { t: 'Ya estás cerca: apretá <kbd>F</kbd> para <b>desembarcar</b>.',
      h: 'Con <kbd>F</kbd> también se entra a los puertos y se conquistan islas.',
      done: S => isl() || owned(S).some(i => i.buildings.length) },
    { t: 'Poné <b>leñadores</b> sobre los árboles o una <b>mina</b> sobre las piedritas de colores.',
      h: 'Elegilos abajo (o teclas <kbd>1</kbd> y <kbd>2</kbd>) y hacé clic en el terreno. Con <kbd>R</kbd> rotás hacia dónde sale la carga (la flecha amarilla).',
      onIsl: true, hl: () => bar('lenadores', 'extractor'),
      done: S => anyB(S, 'extractor') || anyB(S, 'lenadores') },
    { t: 'Construí un <b>almacén</b>.',
      h: 'Tecla <kbd>4</kbd>. Ahí se guarda todo lo que traen tus porteadores.',
      onIsl: true, hl: () => bar('almacen'),
      done: S => anyB(S, 'almacen') },
    { t: 'Uní la salida con el almacén con un <b>sendero</b>.',
      h: 'Tecla <kbd>3</kbd> y arrastrá desde la flecha amarilla hasta el almacén. Por ahí caminan los porteadores con la carga.',
      onIsl: true, hl: () => bar('cinta'),
      done: S => stored(S) > 0 },
    { t: 'Muy bien. Ahora juntá <b>30 recursos</b> en el almacén.',
      h: 'Más leñadores y minas = más rápido. Tu gente sigue trabajando aunque te vayas a navegar. Si un edificio se traba, aparece un ⚠ arriba: pasá el mouse para ver por qué.',
      done: S => stored(S) >= 30 || (S.sold || 0) > 0 },
    { t: '<b>Cargá el barco</b> con lo que juntaste.',
      h: 'En el panel de la isla, los botones <b>⬆ 10</b> o <b>⬆ todo</b> al lado de cada recurso.',
      onIsl: true, hl: () => isl() ? ['#islandInfo button[data-act="ld"]'] : [],
      done: S => PV.Inv.cargoTotal() > 0 || (S.sold || 0) > 0 },
    { t: 'Zarpá y buscá un <b>puerto</b> ⚓ para vender.',
      h: 'Los puertos son los puntos amarillos del minimapa. Acercate y apretá <kbd>F</kbd>.',
      hl: () => isl() ? ['#islandPanel button[data-act="leave"]'] : [],
      done: S => PV.scene === 'port' || (S.sold || 0) > 0 },
    { t: '<b>Vendé</b> tu carga en el mercado.',
      h: 'Si vendés mucho de lo mismo, el precio baja un poco: conviene repartir entre puertos.',
      hl: () => PV.scene === 'port' ? ['#portPanel button[data-tab="mercado"]', '#portPanel button[data-act="sellall"]'] : [],
      done: S => (S.sold || 0) > 0 },
    { t: 'Mejorá tu barco en el <b>astillero</b>.',
      h: 'Cada mejora pide doblones y materiales (por ej. tablones del aserradero). Si no te entran en la bodega, usá <b>Entregar</b> y traelos en varios viajes.',
      hl: () => PV.scene === 'port' ? ['#portPanel button[data-tab="astillero"]', '#portPanel button[data-act="dep"]:not([disabled])', '#portPanel button[data-act="up"]:not([disabled])'] : [],
      done: S => Object.values(S.ship.up).some(v => v > 0) },
    { t: 'Tu gente necesita <b>comida</b>: poné una <b>Pesquería</b> en la costa y una <b>Cocina</b>.',
      h: 'La pesquería (tecla <kbd>P</kbd>) va pegada al agua y saca pescado. La cocina (<kbd>O</kbd>) lo convierte en raciones, y para el fuego necesita <b>madera</b>. Llevale pescado y madera por senderos, y mandá las raciones al almacén.',
      onIsl: true, hl: () => bar('pesqueria', 'cocina'),
      done: S => anyB(S, 'pesqueria') && anyB(S, 'cocina') },
    { t: 'Construí una <b>Taberna</b>.',
      h: 'Tecla <kbd>T</kbd>. De noche tu gente viene a comer y tomar ron. Mandale raciones y ron por senderos (si no, comen del almacén). Cada taberna tiene 20 lugares: sin lugar descansan mal y rinden menos.',
      onIsl: true, hl: () => bar('taberna'),
      done: S => anyB(S, 'taberna') },
    { t: 'Construí un <b>Cartógrafo</b> para empezar a investigar.',
      h: 'Pestaña «Investigación y banca» o tecla <kbd>C</kbd>. Investigando desbloqueás edificios nuevos y mejorás todo.',
      onIsl: true, hl: () => bar('cartografo'),
      done: S => anyB(S, 'cartografo') },
    { t: 'Destruí una <b>torre enemiga</b>.',
      h: 'Las islas ★★ tienen torres. Ponete de costado y dispará con <kbd>Q</kbd> (babor) y <kbd>E</kbd> (estribor).',
      done: S => (S.towersKilled || 0) > 0 },
    { t: '¡Bien ahí! Ahora <b>conquistá una isla nueva</b>, mejor si tiene <b>caña de azúcar</b>.',
      h: 'La caña no crece en Isla Refugio. Las islas comunes (★) cercanas suelen tener caña y no tienen torres: acercate y fundá tu fuerte con <kbd>F</kbd>. Hasta entonces, comprá ron en los puertos.',
      done: S => owned(S).length > 1 },
    { t: 'Hacé tu propio <b>ron</b>: poné un <b>Cañaveral</b> sobre la caña y una <b>Destilería</b>.',
      h: 'El cañaveral (<kbd>U</kbd>) cultiva la caña y nunca se agota. La destilería (<kbd>L</kbd>) hace ron. En islas ★★ y ★★★ hay caña fina: con ella se hace <b>ron añejo</b>, que vale mucho más y sube más la moral. Después llevá el ron a tus otras islas.',
      onIsl: true, hl: () => bar('canaveral', 'destileria'),
      done: S => anyB(S, 'canaveral') && anyB(S, 'destileria') },
  ];

  // ---------- Explicaciones de una sola vez ----------
  const B = k => `${D.BUILD[k].icon} <b>${D.BUILD[k].n}</b>`;
  const TIPS = {
    // Edificios, la primera vez que los elegís para construir.
    'b:aserradero': { t: `${B('aserradero')}: corta madera y hace <b>tablones</b>.`, h: 'Llevale madera con un sendero que entre por cualquier lado, y sacá los tablones por la flecha. Los tablones se piden en casi todo.' },
    'b:fundicion': { t: `${B('fundicion')}: funde minerales y hace <b>lingotes</b>.`, h: 'Necesita mineral (cobre, hierro, estaño…) y <b>carbón</b> o madera para el fuego. Llevale las dos cosas por senderos.' },
    'b:astillero': { t: `${B('astillero')}: carpinteros que hacen y mejoran barcos.`, h: 'Hacé clic para construir balandras y mercantes para esta isla, o mejorar los que tenés. Los de nivel II y III necesitan el plano, que se compra en los puertos (pestaña 🔨 Astillero).' },
    'b:repartidor': { t: `${B('repartidor')}: divide la carga de un sendero en 2.`, h: 'Lo que llega por atrás sale una vez a la izquierda y otra a la derecha. Poné un sendero a cada costado: sirve para repartir entre dos fábricas.' },
    'b:clasificador': { t: `${B('clasificador')}: separa la carga de un sendero.`, h: 'Hacé clic para elegir qué recurso sigue derecho; lo demás sale por los costados. Sirve para mandar cada cosa a su fábrica.' },
    'b:insertador': { t: `${B('insertador')}: agarra cosas de un lado y las deja del otro.`, h: 'Ponelo entre dos edificios (por ejemplo, almacén → fábrica). Con clic elegís qué agarra. Investigando camina más rápido y lleva más por viaje.' },
    'b:herreria': { t: `${B('herreria')}: hace <b>balas</b> y <b>placas de hierro</b>.`, h: 'Hacé clic sobre ella para elegir la receta. Las balas sirven para tus cañones y para las baterías.' },
    'b:taller': { t: `${B('taller')}: hace <b>bronce</b>, <b>lona</b> y, con investigación, pólvora y balas explosivas.`, h: 'Hacé clic sobre él para elegir la receta.' },
    'b:muelle': { t: `${B('muelle')}: carga solo al barco.`, h: 'Va pegado al agua. Lo que le llega por senderos se sube solo al barco o a tus mercantes cuando pasan. Con clic elegís qué bajar al llegar.' },
    'b:pesqueria': { t: `${B('pesqueria')}: pescadores que sacan pescado del mar.`, h: 'Tiene que tocar el agua. El pescado va a la Cocina, que con un poco de madera hace las raciones.' },
    'b:canaveral': { t: `${B('canaveral')}: cultiva caña de azúcar.`, h: 'Va sobre caña silvestre y nunca se agota. La caña común crece en islas ★; la caña fina, en ★★ y ★★★. No hay en Isla Refugio.' },
    'b:cocina': { t: `${B('cocina')}: convierte pescado en raciones.`, h: '2 pescados + 1 madera (leña para el fuego) = 4 raciones. Mandá las raciones a la taberna o al almacén.' },
    'b:destileria': { t: `${B('destileria')}: destila la caña en ron.`, h: '2 cañas = 1 ron. Con caña fina hace <b>ron añejo</b> (clic para elegir la receta): vale casi el triple y sube más la moral.' },
    'b:taberna': { t: `${B('taberna')}: donde tu gente come, toma y descansa de noche.`, h: 'Guarda hasta 40 raciones y 40 de ron, y tiene 20 lugares. Si no alcanza, comen de lo que haya en el almacén.' },
    'b:cartografo': { t: `${B('cartografo')}: investiga mejoras.`, h: 'Hacé clic sobre él (o tecla <kbd>I</kbd>) para elegir qué investigar. Después mandale por senderos o estibadores los materiales que pide.' },
    'b:banco': { t: `${B('banco')}: guarda tus doblones.`, h: 'Lo que guardás no se pierde si te hunden y da interés cada minuto. Ojo: si los piratas saquean la isla, se llevan una parte.' },
    'b:bateria': { t: `${B('bateria')}: cañones en la costa.`, h: 'Tiene que tocar el agua. Le dispara sola a los piratas que atacan la isla, pero necesita <b>balas</b>: mandáselas con un sendero (las explosivas pegan más).' },
    'b:empalizada': { t: `${B('empalizada')}: muro de troncos.`, h: 'Arrastrá para hacer muros. Cada tramo hace que los piratas roben menos y rompan menos edificios.' },
    'b:cuartel': { t: `${B('cuartel')}: guarnición de la isla.`, h: 'Reduce lo que roban los piratas y repara solo, de a uno, los edificios rotos.' },
    'b:torre_vigia': { t: `${B('torre_vigia')}: ve a los piratas desde lejos.`, h: 'Te avisa un minuto antes de un asalto y marca a los atacantes en rojo en el minimapa.' },

    // Momentos del juego.
    night: { t: '🌙 <b>Cayó la noche.</b> Tu gente dejó de trabajar y fue a la taberna a comer y tomar ron.',
      h: 'Cada trabajador come 1 ración y toma medio ron por noche. Si falta comida, al otro día trabajan más lento; si falta ron, baja la moral. Mirá el panel de la isla.' },
    hungry: { t: '🍖 <b>Faltó comida</b> en una de tus islas: hoy trabajan más lento.',
      h: 'Poné una Pesquería y una Cocina, o llevá raciones en el barco y bajalas al almacén.' },
    strike: { t: '✊ <b>¡Huelga!</b> Sin ron, la moral se fue al piso y solo trabajan los que hacen comida.',
      h: 'Llevá ron a la isla en el barco (se compra en los puertos o se hace en otra isla con caña). Con unas noches de ron se termina la huelga.' },
    crew: { t: '🧑‍✈️ Tu <b>tripulación</b> también come y toma ron.',
      h: 'Cada día gasta 2 raciones y 1 ron de la bodega. Sin raciones el barco va más lento; sin ron baja la moral y puede haber <b>motín</b>. En los puertos se compran.' },
    research: { t: '🗺️ <b>Investigación</b>: elegí una mejora y mandale al Cartógrafo los materiales que pide.',
      h: 'Hay cinco líneas: Logística, Producción, Desbloqueos, Navegación y Evoluciones (edificios más grandes). Cuando una termina, elegí la siguiente.' },
    bank: { t: '🏦 <b>Banquero</b>: depositá, retirá o invertí.',
      h: 'Lo guardado da interés hasta un tope. Las inversiones (cuando las investigues) pueden ganar mucho… o salir mal.' },
    raid: { t: '🏴‍☠️ <b>¡Vienen piratas!</b> Si llegan a tu isla, se llevan parte del almacén y del banco, y rompen edificios.',
      h: 'Hundilos con tu barco o armá defensas en la pestaña 🛡️ Defensa: baterías con balas, empalizadas, cuartel y torre vigía. Mientras más crece tu imperio, más fuertes vienen.',
      hl: () => isl() ? ['#buildcats button[data-cat="def"]'] : [] },
    raidHard: { t: '☠️ En <b>modo difícil</b> los piratas pueden <b>quedarse con tus islas</b> (menos Isla Refugio).',
      h: 'Si pasa, destruí sus torres y barcos y volvé a fundar el fuerte con <kbd>F</kbd>.' },
    def: { t: '🛡️ <b>Defensas</b>: protegen la isla de los asaltos piratas.',
      h: 'La batería dispara (necesita balas), la empalizada reduce el saqueo, el cuartel repara y la torre vigía avisa antes.' },
    broken: { t: '🔥 Los piratas <b>rompieron un edificio</b>: no trabaja hasta que lo arregles.',
      h: 'Hacé clic sobre él para repararlo (cuesta una parte de lo que salió construirlo). Un Cuartel los arregla solo, de a uno.' },
    colony: { t: '🏝️ <b>¡Tenés una isla nueva!</b> Cada isla tiene su propio almacén y sus edificios.',
      h: 'Tu gente trabaja en todas a la vez. En el puerto, pestaña ⛵ Flota, podés comprar mercantes que llevan la carga solos de tu isla al puerto.' },
    evo: { t: '★ <b>Evoluciones</b>: versiones grandes de tus edificios.',
      h: 'Ocupan más lugar pero trabajan más rápido y hacen cosas nuevas. Aparecen en la misma pestaña que el edificio original, con borde dorado.' },
  };

  const Tut = {};
  let shownKey = null, knownDone = null, queue = [], lastSel = null, glowSel = '';

  const st = () => PV.state;
  const tipsSeen = S => S.tips || (S.tips = {});
  function want(key) {
    const S = st();
    if (!TIPS[key] || tipsSeen(S)[key] || queue.includes(key)) return;
    queue.push(key);
  }

  // Texto para algo desbloqueado con investigación.
  function unlockTip(id) {
    const t = D.TECH[id], u = t.unlock;
    if (u.build) {
      const ks = [].concat(u.build), cat = D.BUILD_CATS.find(c => c.k === D.BUILD[ks[0]].cat);
      const names = ks.map(B).join(' y ');
      const what = ks.map(k => (TIPS['b:' + k] ? TIPS['b:' + k].h : D.BUILD[k].desc)).join(' ');
      return { t: `🔓 ¡Desbloqueaste ${names}!`, h: `Está en la pestaña ${cat.icon} ${cat.n}. ${what}`,
        hl: () => isl() ? [`#buildcats button[data-cat="${cat.k}"]`].concat(ks.map(k => `#buildbar button[data-b="${k}"]`)) : [] };
    }
    if (u.recipe) {
      const [b, r] = u.recipe.split('.');
      return { t: `🔓 ¡Receta nueva: <b>${D.RES[r].n}</b>!`, h: `Hacé clic en un ${D.BUILD[b].n} y elegí la receta «${D.RES[r].n}». ${t.desc}` };
    }
    if (u.ins) return { t: '🔓 ¡Estibadores con lista!', h: 'Hacé clic en un estibador y elegí <b>🔬 Lo que pide la investigación</b>: saca del almacén solo lo que le falta a la investigación de ahora, aunque adelante tenga un sendero que va al cartógrafo.' };
    if (u.feature === 'inversiones') return { t: '🔓 ¡Desbloqueaste las <b>inversiones</b>!', h: 'Hacé clic en tu Banquero: podés invertir en rutas, expediciones o contrabando. Cuanto más riesgo, más ganancia… o más pérdida.' };
    return { t: `🔓 ¡${t.n}!`, h: t.desc };
  }

  // Busca cosas nuevas que merecen explicación.
  function scan(S) {
    // Investigaciones recién terminadas.
    const done = PV.Tech.st().done;
    if (!knownDone) knownDone = Object.assign({}, done);
    for (const id in done) if (!knownDone[id]) {
      knownDone[id] = true;
      if (D.TECH[id].unlock) { TIPS['u:' + id] = unlockTip(id); want('u:' + id); }
      if (D.TECH[id].line === 'evo') want('evo');
    }
    // Primer edificio de cada tipo que elegís.
    const sel = isl() && PV.Island.sel;
    if (sel && sel !== lastSel) want('b:' + D.base(sel));
    lastSel = sel;
    if (isl() && PV.UI.cat === 'def') want('def');
    if (!$('research').classList.contains('hidden')) want('research');
    if (!$('bank').classList.contains('hidden')) want('bank');
    if (PV.Raid.st().cur) { want('raid'); if (S.diff === 'dificil') want('raidHard'); }
    if (owned(S).some(i => i.buildings.some(b => b.broken))) want('broken');
    if (owned(S).length > 1) want('colony');
    if (PV.Colony.isNight()) want('night');
    if (owned(S).some(i => i.col && i.col.fed < 1)) want('hungry');
    if (owned(S).some(i => i.col && i.col.strike)) want('strike');
    if (S.ship.hungry || (S.ship.mor !== undefined && S.ship.mor < 0.9) || ((S.ship.cargo.raciones || 0) < 2 && PV.scene === 'sea')) want('crew');
  }

  function render(S, item, key, step) {
    if (shownKey === key) return;
    shownKey = key;
    const tip = !step, n = STEPS.length, i = S.tutN;
    const head = tip ? '<small>consejo</small>' : `<small>Paso ${i + 1} / ${n}</small>`;
    const btns = tip ? '<button data-act="ok" class="primary">Entendido</button>'
      : (item.info ? '<button data-act="next" class="primary">Siguiente</button>' : '') + '<button data-act="skip">Saltear tutorial</button>';
    $('quest').innerHTML = `<h4><span>🧔 Contramaestre</span>${head}</h4>
      <div class="qtext">${item.t}</div><div class="qhint">${item.h}</div>
      ${tip ? '' : `<div class="qbar"><div style="width:${(i / n) * 100}%"></div></div>`}
      <div class="qbtns">${btns}<button data-act="hide" title="Ocultar">ocultar</button></div>`;
  }

  function glow(list) {
    const sel = list.join(',');
    document.querySelectorAll('.tut-glow').forEach(el => { if (!sel || !el.matches(sel)) el.classList.remove('tut-glow'); });
    glowSel = sel;
    if (sel) document.querySelectorAll(sel).forEach(el => el.classList.add('tut-glow'));
  }

  Tut.update = function () {
    const S = st(), el = $('quest');
    if (S.tutN === undefined) S.tutN = 0;
    if (S.tutOff) {
      el.classList.add('hidden'); $('tutBtn').classList.remove('hidden'); glow([]);
      return;
    }
    $('tutBtn').classList.add('hidden');
    while (S.tutN < STEPS.length && STEPS[S.tutN].done(S)) {
      S.tutN++;
      if (S.tutN === STEPS.length) PV.UI.toast('🏴‍☠️ ¡Tutorial completo! El archipiélago es tuyo, capitán.', 'good');
    }
    scan(S);
    // Primero las explicaciones nuevas; si no hay, el paso actual de la guía.
    let item = null, key = null, step = false;
    if (queue.length) { key = queue[0]; item = TIPS[key]; }
    else if (S.tutN < STEPS.length) { key = 'step' + S.tutN; item = STEPS[S.tutN]; step = true; }
    el.classList.toggle('hidden', !item);
    if (!item) { glow([]); shownKey = null; return; }
    // Si el paso es en la isla y estás navegando, se avisa.
    render(S, step && item.onIsl && PV.scene === 'sea'
      ? Object.assign({}, item, { h: item.h + notOnIsland }) : item, key, step);
    glow(item.hl ? item.hl() : []);
  };

  // Al cargar otra partida hay que volver a dibujar todo.
  Tut.reset = function () { shownKey = null; knownDone = null; queue = []; lastSel = null; };

  // Apaga o prende el tutorial (también las explicaciones).
  Tut.setOn = function (on) {
    const S = st();
    S.tutOff = !on;
    shownKey = null;
    if (!on) queue = [];
    Tut.update();
  };

  document.addEventListener('click', e => {
    const S = st();
    if (!S) return;
    if (e.target.closest('#tutBtn')) return Tut.setOn(true);
    const b = e.target.closest('#quest button');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'ok') { tipsSeen(S)[queue.shift()] = true; shownKey = null; }
    else if (a === 'next') { S.tutN++; shownKey = null; }
    else if (a === 'skip') { S.tutN = STEPS.length; shownKey = null; PV.UI.toast('Listo, ya no te guío. Igual te voy a explicar las cosas nuevas cuando aparezcan.'); }
    else if (a === 'hide') return Tut.setOn(false);
    Tut.update();
  });

  PV.Tutorial = Tut;
})(window.PV);
