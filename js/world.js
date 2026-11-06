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

  W.generate = function (seed) {
    const r = U.rng(seed);
    const C = W.SIZE / 2;
    const islands = [];
    const names = U.shuffle(r, D.ISLAND_NAMES.slice());
    let ni = 0;

    function add(o) {
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
      if (o.port) {
        o.market = {};
        for (const k in D.RES) o.market[k] = { m: U.range(r, 0.75, 1.35), f: 1 };
      }
      islands.push(o);
      return o;
    }

    function free(x, y, R) {
      if (x < R + 300 || y < R + 300 || x > W.SIZE - R - 300 || y > W.SIZE - R - 300) return false;
      for (const o of islands) if (U.dist(x, y, o.x, o.y) < R * 1.3 + o.R * 1.3 + 220) return false;
      return true;
    }

    add({ x: C, y: C, R: 150, tier: 1, home: true, owned: true, name: 'Isla Refugio' });

    const portDist = [700, 1550, 2500];
    for (let i = 0; i < portDist.length; i++) {
      for (let t = 0; t < 300; t++) {
        const a = r() * TAU;
        const x = C + Math.cos(a) * portDist[i], y = C + Math.sin(a) * portDist[i];
        if (free(x, y, 110)) { add({ x, y, R: 110, tier: 1, port: true, name: D.PORT_NAMES[i] }); break; }
      }
    }

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

    const list = isl.home ? ['madera', 'piedra', 'cobre', 'madera', 'piedra', 'cobre'] : D.TIERS[isl.tier].res.slice();
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
