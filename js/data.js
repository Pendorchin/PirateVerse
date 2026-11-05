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
  };

  // Niveles de isla: más lejos del inicio = más raro y más peligroso.
  D.TIERS = [
    null,
    { n: 'Común',      c: '#8fd17a', res: ['madera', 'piedra', 'cobre', 'estano'], towers: 0, guards: 0 },
    { n: 'Poco común', c: '#5dade2', res: ['hierro', 'carbon', 'algodon', 'madera'], towers: 2, guards: 1 },
    { n: 'Rara',       c: '#bb8fce', res: ['plata', 'azufre', 'especias', 'carbon'], towers: 3, guards: 2 },
    { n: 'Épica',      c: '#f5b041', res: ['oro', 'gemas', 'coral', 'plata'], towers: 4, guards: 3 },
    { n: 'Legendaria', c: '#ec7063', res: ['cristal', 'oro', 'gemas', 'coral'], towers: 5, guards: 4 },
  ];

  // Edificios de isla. w/h en casillas. Todo lo hace gente: mineros, porteadores, estibadores…
  D.BUILD = {
    extractor:   { n: 'Mina',       key: 'Digit1', k: '1', icon: '⛏️', w: 3, h: 3, cost: { doblones: 60 },
                   desc: 'Mineros (o leñadores, si hay árboles) sacan lo que hay debajo y lo dejan en la flecha.' },
    cinta:       { n: 'Sendero',    key: 'Digit2', k: '2', icon: '🚶', w: 1, h: 1, cost: { doblones: 2 },
                   desc: 'Porteadores llevan la carga hacia la flecha. Arrastrá para trazar el camino.' },
    almacen:     { n: 'Almacén',    key: 'Digit3', k: '3', icon: '📦', w: 2, h: 2, cost: { doblones: 50 },
                   desc: 'Guarda lo que le llega en el inventario de la isla.' },
    aserradero:  { n: 'Aserradero', key: 'Digit4', k: '4', icon: '🪵', w: 3, h: 3, cost: { doblones: 80, piedra: 10 },
                   desc: '1 madera → 2 tablones.' },
    fundicion:   { n: 'Fundición',  key: 'Digit5', k: '5', icon: '🔥', w: 3, h: 3, cost: { doblones: 120, piedra: 20 },
                   desc: '2 mineral + combustible (madera o carbón) → 1 lingote.' },
    clasificador:{ n: 'Capataz',    key: 'Digit6', k: '6', icon: '🧭', w: 1, h: 1, cost: { doblones: 30, tablones: 2 },
                   desc: 'Reparte la carga: lo elegido sigue derecho y el resto sale por los costados. Clic para elegir.' },
    insertador:  { n: 'Estibador',  key: 'Digit7', k: '7', icon: '💪', w: 1, h: 1, cost: { doblones: 25 },
                   desc: 'Agarra de atrás (almacén, sendero o taller) y lo deja adelante. Clic para filtrar.' },
    herreria:    { n: 'Herrería',   key: 'Digit8', k: '8', icon: '⚒️', w: 3, h: 3, cost: { doblones: 200, piedra: 20, lingote_hierro: 5 },
                   desc: 'El herrero hace balas de cañón o placas de hierro. Clic para elegir receta.' },
    taller:      { n: 'Taller',     key: 'Digit9', k: '9', icon: '🧵', w: 3, h: 3, cost: { doblones: 180, tablones: 20, piedra: 10 },
                   desc: 'Artesanos hacen bronce, lona, pólvora y balas explosivas. Clic para elegir receta.' },
    muelle:      { n: 'Muelle',     key: 'Digit0', k: '0', icon: '⚓', w: 2, h: 2, cost: { doblones: 100, tablones: 15 },
                   desc: 'Va en la costa. Lo que le llega se carga solo al barco (o a tus mercantes) cuando pasan.' },
  };

  D.EXTRACT_RATE = 0.5;   // objetos por segundo
  D.STORAGE_PER = 200;    // capacidad por almacén
  D.DOCK_CAP = 300;       // capacidad de cada muelle
  D.SMELT = { cobre: 'lingote_cobre', hierro: 'lingote_hierro', plata: 'lingote_plata', oro: 'lingote_oro', estano: 'lingote_estano' };
  D.FUEL = { madera: 1, carbon: 2 };

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

  // Munición del barco, de la mejor a la peor. Sin munición se dispara metralla común (daño normal).
  D.AMMO = [{ k: 'bala_explosiva', mult: 2.2 }, { k: 'balas', mult: 1.5 }];

  // Barcos mercantes automáticos.
  D.MERCHANT = { cost: { doblones: 800, tablones: 40 }, cap: 60, speed: 120, max: 5 };

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
  D.PORT_NAMES = ['Puerto Esperanza', 'Bahía del Contrabandista', 'Fuerte San Telmo'];

  PV.D = D;
})(window.PV);
