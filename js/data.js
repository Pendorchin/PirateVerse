// Datos del juego: recursos, niveles de islas, edificios, recetas y mejoras.
// Están separados de la lógica para poder balancear (o portar a otro motor) sin tocar código.
(function (PV) {
  'use strict';
  const D = {};

  // n: nombre, c: color, p: precio base en doblones
  D.RES = {
    madera:         { n: 'Madera',            c: '#8b5a2b', p: 3 },
    piedra:         { n: 'Piedra',            c: '#a3a3a3', p: 2 },
    cobre:          { n: 'Cobre',             c: '#d9824b', p: 5 },
    hierro:         { n: 'Hierro',            c: '#7b8fa3', p: 9 },
    carbon:         { n: 'Carbón',            c: '#2b2b2b', p: 7 },
    algodon:        { n: 'Algodón',           c: '#f4f1e1', p: 8 },
    azufre:         { n: 'Azufre',            c: '#e3d445', p: 16 },
    plata:          { n: 'Plata',             c: '#dfe4ec', p: 22 },
    especias:       { n: 'Especias',          c: '#c0392b', p: 26 },
    oro:            { n: 'Oro',               c: '#f1c40f', p: 48 },
    gemas:          { n: 'Gemas',             c: '#9b59b6', p: 70 },
    coral:          { n: 'Coral negro',       c: '#3d2856', p: 90 },
    cristal:        { n: 'Cristal de kraken', c: '#3ee6d0', p: 200 },
    tablones:       { n: 'Tablones',          c: '#d2a066', p: 4 },
    lingote_cobre:  { n: 'Lingote de cobre',  c: '#f09a5e', p: 16 },
    lingote_hierro: { n: 'Lingote de hierro', c: '#b4c3d3', p: 28 },
    lingote_plata:  { n: 'Lingote de plata',  c: '#f5f7fb', p: 60 },
    lingote_oro:    { n: 'Lingote de oro',    c: '#ffd84a', p: 125 },
    estano:         { n: 'Estaño',            c: '#9fb0a8', p: 6 },
    lingote_estano: { n: 'Lingote de estaño', c: '#c9d6cf', p: 18 },
    bronce:         { n: 'Bronce',            c: '#cd8b3a', p: 55 },
    placa_hierro:   { n: 'Placa de hierro',   c: '#8d9fb1', p: 60 },
    lona:           { n: 'Lona',              c: '#efe6cf', p: 22 },
    polvora:        { n: 'Pólvora',           c: '#3a3a3a', p: 30 },
    balas:          { n: 'Balas de hierro',   c: '#4a4f55', p: 8 },
    bala_explosiva: { n: 'Bala explosiva',    c: '#c0392b', p: 30 },
    acero:          { n: 'Acero',             c: '#5d6d7e', p: 110 },
    canon_bronce:   { n: 'Cañón de bronce',   c: '#a0662a', p: 320 },
    velamen:        { n: 'Velamen',           c: '#fbf6e9', p: 130 },
    pescado:        { n: 'Pescado',           c: '#7fb3d5', p: 3 },
    cana:           { n: 'Caña de azúcar',    c: '#a9cc5b', p: 3 },
    raciones:       { n: 'Raciones',          c: '#c8925a', p: 9 },
    ron:            { n: 'Ron',               c: '#8e3b1f', p: 20 },
    cana_fina:      { n: 'Caña fina',         c: '#d4e157', p: 9 },
    ron_anejo:      { n: 'Ron añejo',         c: '#5d2a12', p: 60 },
  };

  // Niveles de isla: más lejos del inicio = más raro y más peligroso.
  D.TIERS = [
    null,
    { n: 'Común',      c: '#8fd17a', res: ['madera', 'piedra', 'cobre', 'estano', 'cana'], towers: 0, guards: 0 },
    { n: 'Poco común', c: '#5dade2', res: ['hierro', 'carbon', 'algodon', 'madera', 'cana_fina'], towers: 2, guards: 1 },
    { n: 'Rara',       c: '#bb8fce', res: ['plata', 'azufre', 'especias', 'carbon', 'cana_fina'], towers: 3, guards: 2 },
    { n: 'Épica',      c: '#f5b041', res: ['oro', 'gemas', 'coral', 'plata'], towers: 4, guards: 3 },
    { n: 'Legendaria', c: '#ec7063', res: ['cristal', 'oro', 'gemas', 'coral'], towers: 5, guards: 4 },
  ];

  // Edificios de isla. w/h en casillas. Todo lo hace gente: mineros, porteadores, estibadores…
  D.BUILD = {
    lenadores:   { n: 'Leñadores',  key: 'Digit1', k: '1', icon: '🪓', w: 3, h: 3, cost: { doblones: 50 },
                   desc: 'Campamento de leñadores: va sobre árboles, talan madera y la dejan en la flecha.' },
    extractor:   { n: 'Mina',       key: 'Digit2', k: '2', icon: '⛏️', w: 3, h: 3, cost: { doblones: 60 },
                   desc: 'Va sobre piedra o mineral. Los mineros sacan lo que hay debajo y lo dejan en la flecha.' },
    cinta:       { n: 'Sendero',    key: 'Digit3', k: '3', icon: '🚶', w: 1, h: 1, cost: { doblones: 2 },
                   desc: 'Porteadores llevan la carga hacia la flecha. Arrastrá para trazar el camino.' },
    almacen:     { n: 'Almacén',    key: 'Digit4', k: '4', icon: '📦', w: 2, h: 2, cost: { doblones: 50 },
                   desc: 'Guarda lo que le llega en el inventario de la isla.' },
    aserradero:  { n: 'Aserradero', key: 'Digit5', k: '5', icon: '🪵', w: 3, h: 3, cost: { doblones: 80, piedra: 10 },
                   desc: '1 madera → 2 tablones.' },
    fundicion:   { n: 'Fundición',  key: 'Digit6', k: '6', icon: '🔥', w: 3, h: 3, cost: { doblones: 120, piedra: 20 },
                   desc: '2 mineral + combustible (madera o carbón) → 1 lingote.' },
    clasificador:{ n: 'Capataz',    key: 'Digit7', k: '7', icon: '🧭', w: 1, h: 1, cost: { doblones: 30, tablones: 2 },
                   desc: 'Reparte la carga: lo elegido sigue derecho y el resto sale por los costados. Clic para elegir.' },
    repartidor:  { n: 'Repartidor', key: 'KeyN', k: 'N', icon: '🔀', w: 1, h: 1, cost: { doblones: 30, tablones: 2 },
                   desc: 'Divide la carga en 2 caminos: una a la izquierda y otra a la derecha, turnándose. Si un lado está lleno, manda todo al otro.' },
    insertador:  { n: 'Estibador',  key: 'Digit8', k: '8', icon: '💪', w: 1, h: 1, cost: { doblones: 25 },
                   desc: 'Agarra de atrás (almacén, sendero o taller) y lo deja adelante. Clic para filtrar.' },
    herreria:    { n: 'Herrería',   key: 'Digit9', k: '9', icon: '⚒️', w: 3, h: 3, cost: { doblones: 200, piedra: 20, lingote_hierro: 5 },
                   desc: 'El herrero hace balas de cañón o placas de hierro. Clic para elegir receta.' },
    taller:      { n: 'Taller',     key: 'Digit0', k: '0', icon: '🧵', w: 3, h: 3, cost: { doblones: 180, tablones: 20, piedra: 10 },
                   desc: 'Artesanos hacen bronce, lona, pólvora y balas explosivas. Clic para elegir receta.' },
    muelle:      { n: 'Muelle',     key: 'KeyM', k: 'M', icon: '⚓', w: 2, h: 2, cost: { doblones: 100, tablones: 15 },
                   desc: 'Va en la costa. Lo que le llega se carga solo al barco (o a tus mercantes) cuando pasan.' },
    banco:       { n: 'Banquero',   key: 'KeyB', k: 'B', icon: '🏦', w: 2, h: 2, cost: { doblones: 300, tablones: 30, piedra: 30 },
                   desc: 'Guarda tus doblones: no se pierden si te hunden y dan interés. Clic para depositar, retirar o invertir.' },
    bateria:     { n: 'Batería',    key: 'KeyG', k: 'G', icon: '💣', w: 2, h: 2, cost: { doblones: 200, piedra: 30, lingote_hierro: 10 },
                   desc: 'Cañones en la costa: le disparan a los piratas que atacan la isla. Mandale balas por senderos (las explosivas pegan más).' },
    empalizada:  { n: 'Empalizada', key: 'KeyH', k: 'H', icon: '🪵', w: 1, h: 1, cost: { doblones: 3, tablones: 2 },
                   desc: 'Muro de troncos. Cada tramo reduce lo que roban y protege los edificios (arrastrá para hacer muros).' },
    cuartel:     { n: 'Cuartel',    key: 'KeyJ', k: 'J', icon: '⚔️', w: 3, h: 3, cost: { doblones: 350, tablones: 40, piedra: 30 },
                   desc: 'Guarnición: reduce el saqueo y repara sola los edificios rotos con el tiempo.' },
    torre_vigia: { n: 'Torre vigía', key: 'KeyK', k: 'K', icon: '🔭', w: 1, h: 1, cost: { doblones: 120, tablones: 20, piedra: 10 },
                   desc: 'Ve a los piratas desde lejos: avisa un minuto antes y los marca en el mapa.' },
    pesqueria:   { n: 'Pesquería',  key: 'KeyP', k: 'P', icon: '🎣', w: 2, h: 2, cost: { doblones: 60 },
                   desc: 'Pescadores en la costa: sacan pescado del mar. Tiene que tocar el agua.' },
    canaveral:   { n: 'Cañaveral',  key: 'KeyU', k: 'U', icon: '🌾', w: 3, h: 3, cost: { doblones: 60 },
                   desc: 'Cultiva la caña silvestre y nunca se agota. No crece en Isla Refugio: la caña está en islas ★, y la caña fina (para ron añejo) en ★★ y ★★★.' },
    cocina:      { n: 'Cocina',     key: 'KeyO', k: 'O', icon: '🍲', w: 2, h: 2, cost: { doblones: 80, piedra: 10 },
                   desc: 'Cocineros que convierten pescado en raciones. Necesitan leña para el fuego: 2 pescados + 1 madera = 4 raciones.' },
    destileria:  { n: 'Destilería', key: 'KeyL', k: 'L', icon: '🥃', w: 3, h: 3, cost: { doblones: 120, piedra: 15 },
                   desc: 'Alambiques que destilan la caña en ron, o la caña fina en ron añejo. Clic para elegir.' },
    taberna:     { n: 'Taberna',    key: 'KeyT', k: 'T', icon: '🍺', w: 3, h: 3, cost: { doblones: 120, piedra: 10 },
                   desc: 'De noche tu gente viene a comer, tomar ron y descansar. Mandale raciones y ron por senderos.' },
    cartografo:  { n: 'Cartógrafo', key: 'KeyC', k: 'C', icon: '🗺️', w: 2, h: 2, cost: { doblones: 120, tablones: 20, piedra: 10 },
                   desc: 'Estudia materiales para investigar mejoras. Mandale lo que pide la investigación actual. Clic para elegir qué investigar.' },
  };

  D.EXTRACT_RATE = 0.5;   // objetos por segundo
  D.STORAGE_PER = 200;    // capacidad por almacén
  D.DOCK_CAP = 300;       // capacidad de cada muelle
  // Evoluciones: edificios más grandes que funcionan como su base (of) pero mejor.
  //   spd: velocidad, slots: cuántos almacenes cuenta, capMul: capacidad del muelle,
  //   bonus: lo especial de cada uno (se explica en desc).
  const EVO = {
    mina_profunda:  { of: 'extractor',   n: 'Mina profunda',        icon: '⛏️', w: 4, h: 4, spd: 2.2, cost: { doblones: 400, tablones: 40, lingote_hierro: 20 },
                      desc: 'Mina grande: cubre más yacimiento, trabaja el doble y a veces encuentra plata.' },
    campamento:     { of: 'lenadores',   n: 'Campamento maderero',  icon: '🪓', w: 4, h: 4, spd: 2.2, cost: { doblones: 350, tablones: 60, lingote_hierro: 10 },
                      desc: 'Leñadores que replantan: trabajan el doble y el bosque nunca se agota.' },
    alto_horno:     { of: 'fundicion',   n: 'Alto horno',           icon: '🔥', w: 4, h: 4, spd: 2,   cost: { doblones: 600, piedra: 80, placa_hierro: 10 },
                      desc: 'Funde el doble de rápido y convierte lingotes de hierro en acero.' },
    aserradero_hid: { of: 'aserradero',  n: 'Aserradero hidráulico', icon: '🪵', w: 4, h: 4, spd: 2.5, cost: { doblones: 450, tablones: 40, lingote_hierro: 15 },
                      desc: 'Rueda de agua: corta más rápido y saca 3 tablones por madera.' },
    gran_herreria:  { of: 'herreria',    n: 'Gran herrería',        icon: '⚒️', w: 4, h: 4, spd: 2,   cost: { doblones: 800, piedra: 40, acero: 10 },
                      desc: 'Trabaja el doble y puede fundir cañones de bronce.' },
    gran_taller:    { of: 'taller',      n: 'Gran taller',          icon: '🧵', w: 4, h: 4, spd: 2,   cost: { doblones: 700, tablones: 60, bronce: 15 },
                      desc: 'Trabaja el doble y cose velamen para barcos.' },
    deposito:       { of: 'almacen',     n: 'Depósito',             icon: '🏚️', w: 3, h: 3, slots: 4, cost: { doblones: 300, tablones: 60, piedra: 40 },
                      desc: 'Guarda como 4 almacenes en el espacio de 2.' },
    puerto_propio:  { of: 'muelle',      n: 'Puerto propio',        icon: '⚓', w: 3, h: 3, capMul: 3, cost: { doblones: 500, tablones: 80, lingote_hierro: 15 },
                      desc: 'Muelle grande (3 veces más carga). Además repara tu barco gratis cuando llegás.' },
    academia:       { of: 'cartografo',  n: 'Academia',             icon: '🧭', w: 3, h: 3, spd: 3,   cost: { doblones: 500, tablones: 50, lingote_plata: 5 },
                      desc: 'Muchos cartógrafos juntos: investiga 3 veces más rápido.' },
    casa_cambio:    { of: 'banco',       n: 'Casa de cambio',       icon: '🏦', w: 3, h: 3, cost: { doblones: 1500, piedra: 60, lingote_oro: 5 },
                      desc: 'Banco grande: +50% de interés, guarda el doble con interés, los asaltos se llevan la mitad y permite invertir en la Compañía de Indias.' },
  };
  for (const k in EVO) D.BUILD[k] = Object.assign({ key: '', k: '★' }, EVO[k]);

  // Pestañas del menú de construcción. Las evoluciones van con su edificio base.
  D.BUILD_CATS = [
    { k: 'rec', n: 'Recursos', icon: '⛏️', list: ['lenadores', 'extractor', 'cinta', 'almacen'] },
    { k: 'food', n: 'Comida y ron', icon: '🍺', list: ['pesqueria', 'canaveral', 'cocina', 'destileria', 'taberna'] },
    { k: 'fab', n: 'Fábricas', icon: '🔥', list: ['aserradero', 'fundicion', 'herreria', 'taller'] },
    { k: 'log', n: 'Logística', icon: '💪', list: ['clasificador', 'repartidor', 'insertador', 'muelle'] },
    { k: 'eco', n: 'Investigación y banca', icon: '🗺️', list: ['cartografo', 'banco'] },
    { k: 'def', n: 'Defensa', icon: '🛡️', list: ['bateria', 'empalizada', 'cuartel', 'torre_vigia'] },
  ];
  for (const c of D.BUILD_CATS) for (const k of c.list) D.BUILD[k].cat = c.k;
  for (const k in EVO) D.BUILD[k].cat = D.BUILD[EVO[k].of].cat;

  // ---------- Asaltos piratas ----------
  //   first: segundos hasta el primer asalto; every: base entre asaltos (baja con tu imperio, mínimo minEvery).
  //   warn: aviso previo (la Torre vigía suma watch). siege: segundos de asedio hasta saquear.
  //   loot: parte del almacén y del banco que se llevan; wall/barracks: cuánto reduce cada empalizada / cuartel.
  D.RAID = {
    first: 600, every: 540, minEvery: 180, warn: 60, watch: 60, siege: 75,
    loot: 0.3, wall: 0.02, wallMax: 0.5, barracks: 0.3, barracksMax: 0.6,
    repairEvery: 30, repairCost: 0.3,
    battery: { range: 400, cd: 2.2, dmg: 6, ammo: { bala_explosiva: 22, balas: 13 }, max: 20 },
  };
  D.DIFFS = {
    normal: { n: 'Normal', desc: 'Si los piratas ganan un asalto, saquean el almacén y el banco y rompen algunos edificios. La isla sigue siendo tuya.' },
    dificil: { n: 'Difícil', desc: 'Si los piratas ganan, además te quitan la isla (menos Isla Refugio) y tenés que reconquistarla.' },
  };
  D.base = t => (D.BUILD[t] && D.BUILD[t].of) || t;

  D.SMELT = { cobre: 'lingote_cobre', hierro: 'lingote_hierro', plata: 'lingote_plata', oro: 'lingote_oro', estano: 'lingote_estano' };
  D.FUEL = { madera: 1, carbon: 2 };
  D.SMELT_BIG = { lingote_hierro: 'acero' }; // solo en el Alto horno

  // Recetas de los talleres. t: segundos por tanda, n: cuántos salen.
  D.RECIPES = {
    herreria: {
      balas:        { in: { lingote_hierro: 1 }, out: 'balas', n: 4, t: 2 },
      placa_hierro: { in: { lingote_hierro: 2 }, out: 'placa_hierro', n: 1, t: 3 },
    },
    taller: {
      bronce:         { in: { lingote_cobre: 3, lingote_estano: 1 }, out: 'bronce', n: 2, t: 4 },
      lona:           { in: { algodon: 2 }, out: 'lona', n: 1, t: 2 },
      polvora:        { in: { azufre: 1, carbon: 1 }, out: 'polvora', n: 2, t: 3 },
      bala_explosiva: { in: { balas: 2, polvora: 1 }, out: 'bala_explosiva', n: 2, t: 3 },
    },
  };
  // La cocina gasta leña para el fuego: 1 madera cada 2 pescados (la fundición gasta 1 por lingote).
  D.RECIPES.cocina = { raciones: { in: { pescado: 2, madera: 1 }, out: 'raciones', n: 4, t: 4 } };
  D.RECIPES.destileria = {
    ron:       { in: { cana: 2 }, out: 'ron', n: 1, t: 3 },
    ron_anejo: { in: { cana_fina: 2 }, out: 'ron_anejo', n: 1, t: 4 },
  };
  // Productores que no necesitan yacimiento: k es lo que sacan, rate por segundo.
  D.PRODUCE = { pesqueria: { k: 'pescado', rate: 0.4 } };

  // ---------- Vida en la colonia ----------
  //   day: segundos de un día entero; night: cuánto dura la noche (al final del día); fade: atardecer / amanecer.
  //   crew: trabajadores de cada edificio (las evoluciones, el doble). food: edificios de comida (no hacen huelga).
  //   Cada noche cada trabajador come 1 ración y toma ronPer de ron. seats: lugares por taberna.
  //   strike: con la moral por debajo de esto, hay huelga.
  //   ship / merchant: lo que gasta por día tu tripulación y cada mercante por viaje.
  D.COLONY = {
    day: 360, night: 120, fade: 20,
    crew: { extractor: 2, lenadores: 2, aserradero: 2, fundicion: 2, herreria: 2, taller: 2, cartografo: 1, pesqueria: 1, canaveral: 2, cocina: 1, destileria: 2 },
    food: ['pesqueria', 'canaveral', 'cocina', 'destileria'],
    ronPer: 0.5, anejo: 0.1, // el ron añejo cuenta como ron y además sube la moral
    seats: 20, tavernMax: 40, strike: 0.2,
    ship: { raciones: 2, ron: 1 }, merchant: { raciones: 1, ron: 1 },
    start: { raciones: 30, ron: 15 }, shipStart: { raciones: 6, ron: 3 },
  };

  D.RECIPES.gran_herreria = Object.assign({}, D.RECIPES.herreria, {
    canon_bronce: { in: { bronce: 4, acero: 1 }, out: 'canon_bronce', n: 1, t: 6 },
  });
  D.RECIPES.gran_taller = Object.assign({}, D.RECIPES.taller, {
    velamen: { in: { lona: 3, tablones: 2 }, out: 'velamen', n: 1, t: 4 },
  });

  // ---------- Investigación ----------
  // El Cartógrafo estudia los materiales de a uno: RESEARCH_T segundos por objeto.
  D.RESEARCH_T = 1.2;
  // Líneas de investigación (columnas del panel).
  D.TECH_LINES = [
    { k: 'log', n: 'Logística', icon: '💪' },
    { k: 'prod', n: 'Producción', icon: '⛏️' },
    { k: 'unl', n: 'Desbloqueos', icon: '🔓' },
    { k: 'nav', n: 'Navegación', icon: '⛵' },
    { k: 'evo', n: 'Evoluciones', icon: '🏗️' },
  ];
  // fx: efectos. Los de ADD se suman; el resto se multiplica.
  //   ins (velocidad del estibador), carry (cuánto lleva por viaje), belt (porteadores),
  //   store (almacenes y muelles), mine (minas y leñadores), fab (fábricas),
  //   keep (chance de no gastar el yacimiento), mSpeed / mCap (mercantes), sell (precio de venta).
  // unlock: { build } o { recipe: 'edificio.receta' }.
  D.TECH_ADD = ['carry', 'mCap', 'keep'];

  // Banquero. rate: interés por minuto, cap: saldo máximo que da interés.
  D.BANK = {
    rate: 0.005, cap: 3000,
    // p: chance de salir bien, win/lose: cuánto gana o pierde sobre lo invertido. t: segundos.
    INVEST: {
      indias:     { n: 'Compañía de Indias',  icon: '🏛️', t: 600, p: 0.7, win: 1.0, lose: 0.3, desc: 'Solo con Casa de cambio. Larga, pero rinde mucho.', big: true },
      ruta:       { n: 'Ruta comercial',      icon: '🚢', t: 240, p: 0.75, win: 0.35, lose: 0.15, desc: 'Segura: casi siempre gana un poco.' },
      expedicion: { n: 'Expedición del tesoro', icon: '🗺️', t: 420, p: 0.45, win: 1.3, lose: 0.5,  desc: 'Puede duplicar lo invertido… o perder la mitad.' },
      contrabando:{ n: 'Contrabando',         icon: '🏴‍☠️', t: 180, p: 0.6, win: 0.7, lose: 1,    desc: 'Rápido y jugoso, pero si la Marina lo agarra se pierde todo.' },
    },
  };
  D.TECH = {
    estiba1:  { line: 'log', n: 'Estibadores ágiles', desc: 'Los estibadores caminan más rápido (+40%).', cost: { tablones: 15, piedra: 15 }, fx: { ins: 1.4 } },
    estiba_mapa: { line: 'log', n: 'Estibadores con lista', desc: 'El estibador puede llevar solo lo que pide la investigación (el cartógrafo le pasa la lista).', req: ['estiba1'], cost: { tablones: 20, lingote_cobre: 8 }, unlock: { ins: 'tech' } },
    estiba2:  { line: 'log', n: 'Estibadores fuertes', desc: 'Cada estibador lleva hasta 2 cosas por viaje.', req: ['estiba1'], cost: { tablones: 25, lingote_cobre: 10 }, fx: { carry: 1 } },
    estiba3:  { line: 'log', n: 'Estibadores veteranos', desc: 'Más rápidos (+40%) y llevan hasta 3 por viaje.', req: ['estiba2'], cost: { lingote_hierro: 20, lingote_cobre: 15 }, fx: { ins: 1.4, carry: 1 } },
    estiba4:  { line: 'log', n: 'Maestros estibadores', desc: 'Más rápidos (+50%) y llevan hasta 4 por viaje.', req: ['estiba3'], cost: { placa_hierro: 15, bronce: 10 }, fx: { ins: 1.5, carry: 1 } },
    sendas1:  { line: 'log', n: 'Porteadores ligeros', desc: 'La carga avanza más rápido por los senderos (+30%).', cost: { tablones: 20, piedra: 20 }, fx: { belt: 1.3 } },
    sendas2:  { line: 'log', n: 'Senderos empedrados', desc: 'Otro +30% de velocidad en los senderos.', req: ['sendas1'], cost: { piedra: 60, lingote_hierro: 15 }, fx: { belt: 1.3 } },
    bodegas:  { line: 'log', n: 'Almacenes grandes', desc: 'Almacenes y muelles guardan 50% más.', cost: { tablones: 40, lingote_cobre: 10 }, fx: { store: 1.5 } },

    mineros1: { line: 'prod', n: 'Mejores herramientas', desc: 'Minas y leñadores trabajan 30% más rápido.', cost: { tablones: 20, lingote_cobre: 10 }, fx: { mine: 1.3 } },
    mineros2: { line: 'prod', n: 'Picos de hierro', desc: 'Otro +30% para minas y leñadores.', req: ['mineros1'], cost: { lingote_hierro: 25, tablones: 20 }, fx: { mine: 1.3 } },
    vetas:    { line: 'prod', n: 'Vetas profundas', desc: '1 de cada 4 extracciones no gasta el yacimiento.', req: ['mineros1'], cost: { lingote_hierro: 15, lingote_estano: 10 }, fx: { keep: 0.25 } },
    fab1:     { line: 'prod', n: 'Capataces exigentes', desc: 'Fundiciones, aserraderos y talleres trabajan 25% más rápido.', cost: { tablones: 30, lingote_cobre: 15 }, fx: { fab: 1.25 } },
    fab2:     { line: 'prod', n: 'Fuelles y hornos', desc: 'Otro +25% para todas las fábricas.', req: ['fab1'], cost: { piedra: 40, lingote_hierro: 20 }, fx: { fab: 1.25 } },

    herreria: { line: 'unl', n: 'Herrería', desc: 'Permite construir la Herrería: balas y placas de hierro.', cost: { lingote_cobre: 15, piedra: 20 }, unlock: { build: 'herreria' } },
    taller:   { line: 'unl', n: 'Taller', desc: 'Permite construir el Taller: bronce y lona.', cost: { lingote_cobre: 10, tablones: 30 }, unlock: { build: 'taller' } },
    polvora:  { line: 'unl', n: 'Pólvora', desc: 'El Taller puede mezclar pólvora (azufre + carbón).', req: ['taller'], cost: { azufre: 10, carbon: 10 }, unlock: { recipe: 'taller.polvora' } },
    explosiva:{ line: 'unl', n: 'Balas explosivas', desc: 'El Taller arma balas explosivas (más del doble de daño).', req: ['polvora', 'herreria'], cost: { balas: 20, polvora: 10 }, unlock: { recipe: 'taller.bala_explosiva' } },

    merc1:    { line: 'nav', n: 'Cascos ligeros', desc: 'Los mercantes navegan 25% más rápido.', cost: { tablones: 40, lingote_cobre: 10 }, fx: { mSpeed: 1.25 } },
    merc2:    { line: 'nav', n: 'Bodegas amplias', desc: 'Los mercantes cargan 30 más.', req: ['merc1'], cost: { tablones: 60, lingote_hierro: 15 }, fx: { mCap: 30 } },
    merc3:    { line: 'nav', n: 'Velas de lona', desc: 'Mercantes +25% de velocidad y 30 más de carga.', req: ['merc2'], cost: { lona: 20, placa_hierro: 10 }, fx: { mSpeed: 1.25, mCap: 30 } },
    regateo:  { line: 'nav', n: 'Regateo', desc: 'Los puertos te pagan 10% más.', cost: { lingote_cobre: 20, tablones: 20 }, fx: { sell: 1.1 } },
    banca:    { line: 'nav', n: 'Banca', desc: 'Permite construir el Banquero: guarda doblones a salvo del hundimiento y da 0,5% por minuto.', cost: { lingote_cobre: 25, tablones: 30 }, unlock: { build: 'banco' } },
    inversiones:{ line: 'nav', n: 'Inversiones', desc: 'El Banquero acepta inversiones con riesgo: rutas, expediciones y contrabando.', req: ['banca'], cost: { lingote_hierro: 15, lingote_cobre: 20 }, unlock: { feature: 'inversiones' } },
    prestamistas:{ line: 'nav', n: 'Prestamistas', desc: 'Interés al doble (1% por minuto) y hasta 15.000 doblones.', req: ['banca'], cost: { lingote_plata: 15, bronce: 10 }, fx: { bankRate: 2, bankCap: 5 } },
    boveda:   { line: 'nav', n: 'Bóveda reforzada', desc: 'Los asaltos piratas al banco se llevan la mitad.', req: ['banca'], cost: { placa_hierro: 15, piedra: 60 }, fx: { vault: 2 } },
    evo_minas:   { line: 'evo', n: 'Minas profundas', desc: 'Desbloquea la Mina profunda y el Campamento maderero (4x4).', req: ['mineros1'], cost: { lingote_hierro: 30, tablones: 40 }, unlock: { build: ['mina_profunda', 'campamento'] } },
    evo_horno:   { line: 'evo', n: 'Alto horno', desc: 'Desbloquea el Alto horno (4x4): más rápido y hace acero.', req: ['fab1'], cost: { placa_hierro: 15, piedra: 80 }, unlock: { build: 'alto_horno' } },
    evo_sierra:  { line: 'evo', n: 'Rueda de agua', desc: 'Desbloquea el Aserradero hidráulico (4x4): 3 tablones por madera.', req: ['fab1'], cost: { lingote_hierro: 15, tablones: 60 }, unlock: { build: 'aserradero_hid' } },
    evo_herreria:{ line: 'evo', n: 'Gran herrería', desc: 'Desbloquea la Gran herrería (4x4): cañones de bronce.', req: ['herreria', 'evo_horno'], cost: { bronce: 20, acero: 10 }, unlock: { build: 'gran_herreria' } },
    evo_taller:  { line: 'evo', n: 'Gran taller', desc: 'Desbloquea el Gran taller (4x4): velamen.', req: ['taller'], cost: { bronce: 20, lona: 20 }, unlock: { build: 'gran_taller' } },
    evo_deposito:{ line: 'evo', n: 'Depósitos y puertos', desc: 'Desbloquea el Depósito y el Puerto propio (3x3).', req: ['bodegas'], cost: { tablones: 80, lingote_hierro: 20 }, unlock: { build: ['deposito', 'puerto_propio'] } },
    evo_academia:{ line: 'evo', n: 'Academia', desc: 'Desbloquea la Academia (3x3): investiga 3 veces más rápido.', cost: { lingote_plata: 10, tablones: 50 }, unlock: { build: 'academia' } },
    evo_banco:   { line: 'evo', n: 'Casa de cambio', desc: 'Desbloquea la Casa de cambio (3x3): banco mejorado.', req: ['banca'], cost: { lingote_oro: 10, lingote_plata: 10 }, unlock: { build: 'casa_cambio' } },
    contactos:{ line: 'nav', n: 'Contactos en el puerto', desc: 'Otro 10% más en las ventas.', req: ['regateo'], cost: { lingote_plata: 10 }, fx: { sell: 1.1 } },
  };

  // Munición del barco, de la mejor a la peor. Sin munición se dispara metralla común (daño normal).
  D.AMMO = [{ k: 'bala_explosiva', mult: 2.2 }, { k: 'balas', mult: 1.5 }];

  // Barcos mercantes automáticos.
  D.MERCHANT = { cost: { doblones: 800, tablones: 40 }, cap: 60, speed: 120, max: 5 };
  // Balandra de cabotaje: se compra en el muelle de una isla tuya y mueve carga entre tus islas.
  // Hasta 2 paradas; en cada una trae carga a su isla o lleva carga desde su isla.
  D.COASTER = { cost: { doblones: 400, tablones: 30 }, cap: 40, speed: 144, perDock: 2, stops: 2, wait: 4 };

  // Mejoras del barco. lv[0] es el barco inicial.
  D.UP = {
    bodega: { n: 'Bodega', icon: '📦', desc: 'Capacidad de carga', fmt: l => `${l.v} unidades`, lv: [
      { v: 20 },
      { v: 40,  cost: { doblones: 150, tablones: 20 } },
      { v: 70,  cost: { doblones: 400, tablones: 40, lingote_hierro: 10 } },
      { v: 110, cost: { doblones: 900, tablones: 60, placa_hierro: 15 } },
      { v: 160, cost: { doblones: 2000, tablones: 80, placa_hierro: 25, lingote_plata: 15 } },
    ] },
    casco: { n: 'Casco', icon: '🛡️', desc: 'Vida máxima del barco', fmt: l => `${l.v} de vida`, lv: [
      { v: 100 },
      { v: 150, cost: { doblones: 200, tablones: 15, lingote_cobre: 10 } },
      { v: 220, cost: { doblones: 600, lingote_hierro: 20 } },
      { v: 320, cost: { doblones: 1500, placa_hierro: 25, lingote_plata: 10 } },
      { v: 460, cost: { doblones: 3500, coral: 20, placa_hierro: 40 } },
    ] },
    canones: { n: 'Cañones', icon: '💥', desc: 'Cañones por banda y daño', fmt: l => `${l.v} por banda, daño ${l.dmg}`, lv: [
      { v: 2, dmg: 10 },
      { v: 3, dmg: 11, cost: { doblones: 250, lingote_cobre: 15 } },
      { v: 4, dmg: 13, cost: { doblones: 700, lingote_hierro: 25 } },
      { v: 5, dmg: 16, cost: { doblones: 1600, bronce: 30, polvora: 20 } },
      { v: 6, dmg: 20, cost: { doblones: 3500, bronce: 50, lingote_oro: 10, polvora: 30 } },
    ] },
    velas: { n: 'Velas', icon: '🌬️', desc: 'Velocidad máxima', fmt: l => `velocidad ${l.v}`, lv: [
      { v: 150 },
      { v: 175, cost: { doblones: 180, tablones: 25 } },
      { v: 200, cost: { doblones: 500, lona: 10, tablones: 30 } },
      { v: 225, cost: { doblones: 1200, lona: 25, lingote_hierro: 15 } },
      { v: 255, cost: { doblones: 2800, lona: 40, lingote_plata: 15 } },
    ] },
  };

  D.ISLAND_NAMES = [
    'de la Calavera', 'del Ahorcado', 'de los Suspiros', 'del Tiburón', 'del Loro', 'de la Niebla',
    'del Coral', 'de las Ánimas', 'del Viento', 'del Cangrejo', 'de la Sirena', 'del Trueno',
    'del Ancla', 'de Hueso', 'del Eco', 'del Sol', 'de Ceniza', 'del Kraken', 'de Ámbar',
    'de la Luna', 'del Náufrago', 'de la Tormenta', 'del Cuervo', 'de la Perla', 'del Jaguar',
    'de la Serpiente', 'del Faro', 'de Sal', 'del Ocaso', 'de los Muertos',
  ];
  D.ISLAND_PRE = ['Isla', 'Cayo', 'Atolón', 'Islote', 'Peñón'];

  // Zonas del mar: cada una produce sus mercancías (sus puertos las venden y se reponen),
  // paga bien lo que le falta y no compra algunas cosas. Comerciar entre zonas deja ganancia.
  // c: color del agua, mc: color en el minimapa, ports: nombres de sus puertos.
  D.ZONES = {
    mansas:   { n: 'Aguas Mansas',          c: '#14507a', mc: '#1b5a85', ports: ['Puerto Esperanza'],
                goods: ['madera', 'piedra', 'cobre', 'tablones', 'pescado'], wants: ['especias', 'algodon', 'ron_anejo'], refuses: [] },
    brumas:   { n: 'Mar de las Brumas',     c: '#24506a', mc: '#33657f', ports: ['Puerto Niebla', 'Fuerte San Telmo'],
                goods: ['hierro', 'carbon', 'estano', 'lingote_hierro'], wants: ['ron', 'cana', 'raciones', 'lona'], refuses: ['pescado', 'coral'] },
    especias: { n: 'Costa de las Especias', c: '#12627c', mc: '#1a7894', ports: ['Puerto Canela', 'Bahía de la Pimienta'],
                goods: ['especias', 'algodon', 'cana_fina', 'lona'], wants: ['lingote_hierro', 'placa_hierro', 'polvora', 'lingote_plata'], refuses: ['cana', 'madera'] },
    coral:    { n: 'Arrecifes de Coral',    c: '#0f6a82', mc: '#178299', ports: ['Puerto Perla', 'Caleta de Nácar'],
                goods: ['coral', 'pescado', 'gemas'], wants: ['tablones', 'raciones', 'velamen', 'ron'], refuses: ['piedra', 'carbon'] },
    volcan:   { n: 'Mar de Ceniza',         c: '#2c4358', mc: '#3b5670', ports: ['Puerto Ceniza', 'Bahía del Contrabandista'],
                goods: ['azufre', 'polvora', 'carbon', 'plata'], wants: ['especias', 'ron_anejo', 'tablones', 'lingote_cobre'], refuses: ['algodon', 'lona'] },
  };
  // Lo básico para la tripulación y los cañones se vende en todos los puertos.
  D.PORT_BASICS = ['raciones', 'ron', 'balas'];

  PV.D = D;
})(window.PV);
