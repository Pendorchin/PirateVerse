// Generación procedural del archipiélago y de la grilla de cada isla.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D;
  const TAU = Math.PI * 2;
  const W = {};

  W.SIZE = 7000;
  W.FOG_CELL = 200;
  W.FOG_N = Math.ceil(W.SIZE / W.FOG_CELL);

  // Radio de la costa en el ángulo a (forma irregular, igual en el mar y en la grilla).
  W.radius = function (isl, a) {
    const s = isl.sh;
    return isl.R * (1 + s[3] * Math.sin(3 * a + s[0]) + s[4] * Math.sin(5 * a + s[1]) + 0.05 * Math.sin(9 * a + s[2]));
  };

  W.towerHp = tier => 50 + tier * 35;

  // Centro de una casilla de la grilla de la isla, en coordenadas del mar (misma escala que genGrid).
  W.tileToWorld = function (isl, tx, ty) {
    const s = Math.max(12, isl.R * 0.08);
    return [isl.x + (tx - 24) * s * 0.72, isl.y + (ty - 18) * s];
  };

  // Cada isla recibe RES_PER recursos de los de su nivel, distintos entre islas. Se reparten como cartas
  // de un mazo mezclado, así cada recurso del nivel aparece en al menos una isla del mundo.
  const RES_PER = 3;
  function dealResources(r, islands) {
    for (let t = 1; t < D.TIERS.length; t++) {
      const list = U.shuffle(r, islands.filter(i => i.tier === t && !i.home && !i.port));
      const pool = D.TIERS[t].res;
      let deck = [];
      for (const isl of list) {
        isl.res = [];
        let guard = 0;
        while (isl.res.length < Math.min(RES_PER, pool.length) && guard++ < 50) {
          if (!deck.length) deck = U.shuffle(r, pool.slice());
          const k = deck.shift();
          if (isl.res.includes(k)) deck.push(k); else isl.res.push(k);
        }
      }
    }
  }

  // ---------- Zonas del mar ----------
  // Un círculo de aguas mansas en el centro y cuatro mares alrededor (este, sur, oeste, norte),
  // con bordes ondulados para que no parezcan una cuadrícula.
  const OUTER = ['especias', 'coral', 'volcan', 'brumas'];
  W.innerR = a => 1400 + 160 * Math.sin(3 * a + 0.7);
  const bend = d => 0.18 * Math.sin(d / 450);
  W.zoneAt = function (x, y) {
    const C = W.SIZE / 2, dx = x - C, dy = y - C, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < W.innerR(a)) return 'mansas';
    const s = Math.round((a + bend(d)) / (Math.PI / 2));
    return OUTER[((s % 4) + 4) % 4];
  };
  W.zone = isl => D.ZONES[isl.zone || W.zoneAt(isl.x, isl.y)];

  // Formas para dibujar las zonas en el mar (se calculan una sola vez).
  let shapes = null;
  W.zoneShapes = function () {
    if (shapes) return shapes;
    const C = W.SIZE / 2, Q = Math.PI / 2;
    const pt = (d, a) => [C + Math.cos(a) * d, C + Math.sin(a) * d];
    const curve = (b, from, to, step) => {
      const out = [];
      for (let d = from; step > 0 ? d <= to : d >= to; d += step) out.push(pt(d, b - bend(d)));
      return out;
    };
    shapes = { outer: [], lines: [] };
    OUTER.forEach((k, s) => {
      const p = new Path2D();
      const pts = curve(s * Q - Q / 2, 900, 5200, 60).concat(curve(s * Q + Q / 2, 5200, 900, -60));
      pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
      shapes.outer.push({ k, p });
      // Borde entre dos mares, desde donde termina el círculo del centro.
      const l = new Path2D();
      let started = false;
      for (const [x, y] of curve(s * Q - Q / 2, 900, 5200, 40)) {
        if (W.zoneAt(x, y) === 'mansas') continue;
        started ? l.lineTo(x, y) : l.moveTo(x, y);
        started = true;
      }
      shapes.lines.push(l);
    });
    const m = new Path2D();
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * TAU, [x, y] = pt(W.innerR(a), a);
      i ? m.lineTo(x, y) : m.moveTo(x, y);
    }
    m.closePath();
    shapes.inner = m;
    return shapes;
  };

  // Zona de cada casilla de niebla (para el minimapa).
  let zgrid = null;
  W.zoneGrid = function () {
    if (zgrid) return zgrid;
    zgrid = [];
    for (let j = 0; j < W.FOG_N; j++) for (let i = 0; i < W.FOG_N; i++) zgrid.push(W.zoneAt((i + 0.5) * W.FOG_CELL, (j + 0.5) * W.FOG_CELL));
    return zgrid;
  };

  // ---------- Mercado de un puerto según su zona ----------
  W.isBasic = k => D.PORT_BASICS.includes(k);
  W.forSale = (isl, k) => W.isBasic(k) || W.zone(isl).goods.includes(k);
  W.stockMax = k => (W.isBasic(k) ? 40 : U.clamp(Math.round(500 / D.RES[k].p), 15, 120));
  W.setupMarket = function (isl, r) {
    isl.zone = W.zoneAt(isl.x, isl.y);
    const Z = D.ZONES[isl.zone], old = isl.market || {};
    isl.market = {};
    for (const k in D.RES) {
      const m = Z.goods.includes(k) ? U.range(r, 0.55, 0.7)
        : Z.wants.includes(k) ? U.range(r, 1.5, 1.8)
        : W.isBasic(k) ? 1 : U.range(r, 0.85, 1.15);
      isl.market[k] = { m, f: old[k] ? old[k].f : 1 };
      if (W.forSale(isl, k)) isl.market[k].s = W.stockMax(k);
    }
  };

  // ---------- Islas ----------
  function addIsland(islands, r, o) {
      o.id = islands.length;
      o.sh = [r() * TAU, r() * TAU, r() * TAU, U.range(r, 0.08, 0.2), U.range(r, 0.04, 0.1)];
      o.owned = !!o.owned;
      o.explored = false;
      o.storage = {};
      o.buildings = [];
      o.grid = null;
      o.towers = [];
      const nt = o.port || o.owned ? 0 : D.TIERS[o.tier].towers;
      const off = r() * TAU;
      for (let i = 0; i < nt; i++) {
        const a = off + (i / nt) * TAU;
        const rr = W.radius(o, a) * 0.9;
        const hp = W.towerHp(o.tier);
        o.towers.push({ x: o.x + Math.cos(a) * rr, y: o.y + Math.sin(a) * rr, hp, max: hp, cd: r() * 2 });
      }
      if (o.port) W.setupMarket(o, r);
      islands.push(o);
      return o;
  }

  function freeSpot(islands, x, y, R) {
    if (x < R + 300 || y < R + 300 || x > W.SIZE - R - 300 || y > W.SIZE - R - 300) return false;
    for (const o of islands) if (U.dist(x, y, o.x, o.y) < R * 1.3 + o.R * 1.3 + 220) return false;
    return true;
  }

  // Unos 8 puertos: uno cerca del inicio, uno en cada mar y otros tres más lejos.
  // Sirve para partidas nuevas y para sumar los que faltan en partidas viejas.
  W.addPorts = function (islands, r) {
    const need = { mansas: 1 };
    for (const k of OUTER) need[k] = 1;
    for (const k of U.shuffle(r, OUTER.slice()).slice(0, 3)) need[k]++;
    const have = {};
    for (const o of islands) if (o.port) { const z = W.zoneAt(o.x, o.y); have[z] = (have[z] || 0) + 1; }
    const used = new Set(islands.filter(o => o.port).map(o => o.name));
    const C = W.SIZE / 2, Q = Math.PI / 2;
    let added = 0;
    for (const z in need) {
      for (let n = have[z] || 0; n < need[z]; n++) {
        const ring = z === 'mansas' ? [650, 950] : n === 0 ? [1800, 2300] : [2650, 3050];
        const mid = z === 'mansas' ? null : OUTER.indexOf(z) * Q;
        for (let t = 0; t < 400; t++) {
          const a = mid === null ? r() * TAU : mid + U.range(r, -0.55, 0.55), d = U.range(r, ring[0], ring[1]);
          const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d;
          if (W.zoneAt(x, y) !== z || !freeSpot(islands, x, y, 110)) continue;
          const spare = ['Caleta Escondida', 'Fuerte Corsario', 'Puerto Gaviota', 'Bahía de los Náufragos'];
          const name = D.ZONES[z].ports.concat(spare).find(p => !used.has(p)) || 'Puerto ' + (islands.length + 1);
          used.add(name);
          addIsland(islands, r, { x, y, R: 110, tier: 1, port: true, name });
          added++;
          break;
        }
      }
    }
    return added;
  };

  W.generate = function (seed) {
    const r = U.rng(seed);
    const C = W.SIZE / 2;
    const islands = [];
    const names = U.shuffle(r, D.ISLAND_NAMES.slice());
    let ni = 0;
    const add = o => addIsland(islands, r, o);
    const free = (x, y, R) => freeSpot(islands, x, y, R);

    add({ x: C, y: C, R: 150, tier: 1, home: true, owned: true, name: 'Isla Refugio' });
    W.addPorts(islands, r);

    // Primero se ubican las islas y después se reparte el nivel según la distancia al inicio,
    // así siempre hay varias comunes cerca y pocas legendarias lejos.
    const spots = [];
    let tries = 0;
    while (spots.length < 27 && tries++ < 6000) {
      const x = U.range(r, 300, W.SIZE - 300), y = U.range(r, 300, W.SIZE - 300);
      const R = U.range(r, 90, 150);
      if (!free(x, y, R) || spots.some(s => U.dist(x, y, s.x, s.y) < (R + s.R) * 1.3 + 220)) continue;
      spots.push({ x, y, R, d: U.dist(x, y, C, C) + (r() - 0.5) * 400 });
    }
    spots.sort((a, b) => a.d - b.d);
    const share = [0.3, 0.25, 0.2, 0.15, 0.1];
    spots.forEach((s, i) => {
      let f = i / spots.length, tier = 1;
      while (tier < 5 && f >= share[tier - 1]) { f -= share[tier - 1]; tier++; }
      const pre = D.ISLAND_PRE[Math.floor(r() * D.ISLAND_PRE.length)];
      add({ x: s.x, y: s.y, R: s.R + tier * 8, tier, name: pre + ' ' + names[ni++ % names.length] });
    });
    dealResources(r, islands);
    return islands;
  };

  // Grilla de construcción. land: 0 agua, 1 arena, 2 pasto. res/amt: yacimientos que se agotan.
  W.genGrid = function (isl, seed) {
    const r = U.rng((seed ^ (isl.id * 7919 + 13)) >>> 0);
    const w = 48, h = 36, n = w * h;
    const s = Math.max(12, isl.R * 0.08);  // unidades de mundo por casilla
    const land = new Array(n).fill(0), res = new Array(n).fill(''), amt = new Array(n).fill(0);

    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const dx = (i + 0.5 - w / 2) * s * 0.72, dy = (j + 0.5 - h / 2) * s;
        const d = Math.hypot(dx, dy), rr = W.radius(isl, Math.atan2(dy, dx));
        land[j * w + i] = d < rr * 0.86 ? 2 : d < rr ? 1 : 0;
      }
    }

    const list = isl.home ? ['madera', 'piedra', 'cobre', 'madera', 'piedra', 'cobre'] : (isl.res || D.TIERS[isl.tier].res).slice();
    if (isl.res) list.push(...isl.res.slice(0, 2)); // menos tipos, pero más vetas de cada uno
    if (!isl.home) list.push(list[0]);
    const mult = 1 + (isl.tier - 1) * 0.25;

    for (const k of list) {
      let cx = -1, cy = -1;
      for (let t = 0; t < 300; t++) {
        const x = Math.floor(r() * w), y = Math.floor(r() * h);
        if (land[y * w + x] === 2 && !res[y * w + x]) { cx = x; cy = y; break; }
      }
      if (cx < 0) continue;
      const rad = U.range(r, 2.3, 3.6);
      for (let j = Math.floor(cy - rad); j <= cy + rad; j++) {
        for (let i = Math.floor(cx - rad); i <= cx + rad; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const idx = j * w + i;
          const d = Math.hypot(i - cx, j - cy) + (U.hash(i * 3 + isl.id, j * 5) - 0.5) * 1.2;
          if (d > rad || land[idx] !== 2 || res[idx]) continue;
          res[idx] = k;
          amt[idx] = Math.round(U.range(r, 140, 260) * mult * (1.2 - (d / rad) * 0.5));
        }
      }
    }
    return { w, h, land, res, amt };
  };

  PV.World = W;
})(window.PV);
