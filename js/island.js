// Vista de isla: grilla de construcción estilo Factorio (extractores, cintas, fábricas).
// La simulación de TODAS las islas propias corre siempre, aunque estés en el mar.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D;
  const T = 32;
  const TAU = Math.PI * 2;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // este, sur, oeste, norte
  const BELT_SPEED = 1.9;  // casillas por segundo
  const GAP = 0.34;        // separación mínima entre objetos en una cinta
  const INS_BACK = 2;      // segundos que espera el estibador antes de devolver lo que no puede entregar
  const INS_T = 0.7;       // segundos por viaje del estibador (sin investigación)
  const Isl = { cur: null, sel: null, dir: 0, cam: { x: 0, y: 0, z: 1 }, drag: null, pan: null, hover: null };

  // ---------- Grilla y ocupación ----------

  Isl.ensureGrid = function (isl) {
    if (!isl.grid) isl.grid = PV.World.genGrid(isl, PV.state.seed);
    if (!isl._occ) Isl.rebuildOcc(isl);
  };

  Isl.rebuildOcc = function (isl) {
    const g = isl.grid;
    isl._occ = new Array(g.w * g.h).fill(null);
    isl._nAlm = 0;
    for (const b of isl.buildings) mark(isl, b, b);
  };

  function mark(isl, b, v) {
    const def = D.BUILD[b.type], g = isl.grid;
    for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) isl._occ[(b.y + j) * g.w + b.x + i] = v;
    if (D.base(b.type) === 'almacen') isl._nAlm += (v ? 1 : -1) * (def.slots || 1);
  }

  function inside(isl, x, y) { const g = isl.grid; return x >= 0 && y >= 0 && x < g.w && y < g.h; }
  function occAt(isl, x, y) { return inside(isl, x, y) ? isl._occ[y * isl.grid.w + x] : null; }
  function landAt(isl, x, y) { return inside(isl, x, y) ? isl.grid.land[y * isl.grid.w + x] : 0; }

  // Los leñadores solo talan árboles; la mina saca todo lo demás.
  // El cañaveral cultiva la caña silvestre (no se agota).
  const DIGGERS = { lenadores: 1, extractor: 1, canaveral: 1 };
  const digs = (type, k) => {
    if (!k) return false;
    const kb = D.base(type);
    return kb === 'lenadores' ? k === 'madera' : kb === 'canaveral' ? (k === 'cana' || k === 'cana_fina') : k !== 'madera' && k !== 'cana' && k !== 'cana_fina';
  };
  const isDigger = type => !!DIGGERS[D.base(type)];
  // Alto horno: además de minerales, convierte lingotes de hierro en acero.
  const smeltOf = b => b.type === 'alto_horno' ? Object.assign({}, D.SMELT, D.SMELT_BIG) : D.SMELT;
  const spdOf = b => D.BUILD[b.type].spd || 1;

  Isl.canPlace = function (isl, type, x, y) {
    const def = D.BUILD[type], g = isl.grid;
    let res = 0;
    for (let j = 0; j < def.h; j++) {
      for (let i = 0; i < def.w; i++) {
        const tx = x + i, ty = y + j;
        if (!landAt(isl, tx, ty) || occAt(isl, tx, ty)) return false;
        if (digs(type, g.res[ty * g.w + tx])) res++;
      }
    }
    if (D.base(type) === 'muelle' || type === 'bateria' || type === 'pesqueria') return touchesWater(isl, x, y, def);
    return !isDigger(type) || res > 0;
  };

  function touchesWater(isl, x, y, def) {
    for (let j = -1; j <= def.h; j++) for (let i = -1; i <= def.w; i++) {
      if (!landAt(isl, x + i, y + j)) return true;
    }
    return false;
  }

  function tryPlace(isl, type, x, y, dir, quiet) {
    const lock = PV.Tech.buildLocked(type);
    if (lock) { if (!quiet) PV.UI.toast(`Primero investigá «${D.TECH[lock].n}» en un Cartógrafo (tecla I).`, 'bad'); return null; }
    if (!Isl.canPlace(isl, type, x, y)) {
      const kb = D.base(type);
      if (!quiet) PV.UI.toast(kb === 'extractor' ? 'La mina tiene que ir sobre piedra o mineral.' : kb === 'lenadores' ? 'Los leñadores tienen que ir sobre árboles.' : kb === 'muelle' ? 'El muelle tiene que tocar el agua.' : kb === 'bateria' ? 'La batería tiene que ir en la costa.' : kb === 'pesqueria' ? 'La pesquería tiene que tocar el agua.' : kb === 'canaveral' ? 'El cañaveral tiene que ir sobre caña de azúcar silvestre (crece en otras islas, no en Isla Refugio).' : 'No se puede construir ahí.', 'bad');
      return null;
    }
    const cost = D.BUILD[type].cost;
    if (!PV.Inv.canPay(cost, isl)) { PV.UI.toast('Te falta: ' + PV.Inv.costHtml(cost, isl).replace(/<[^>]+>/g, ''), 'bad'); return null; }
    PV.Inv.pay(cost, isl);
    const b = { id: PV.state.nextId++, type, x, y, dir };
    const kd = D.base(type);
    if (kd === 'cinta') b.items = [];
    else { b.prog = 0; b.out = []; }
    if (DIGGERS[kd]) b.ri = 0;
    if (kd === 'fundicion') { b.ore = null; b.oreN = 0; b.fuel = 0; }
    if (kd === 'aserradero') b.n = 0;
    if (kd === 'clasificador') { b.filter = null; b.hold = null; }
    if (kd === 'insertador') { b.filter = null; b.hand = null; b.handN = 0; }
    if (kd === 'cartografo' || kd === 'taberna') b.inv = {};
    if (kd === 'bateria') { b.ammo = {}; b.cd = 0; }
    if (D.RECIPES[type]) { b.recipe = Object.keys(D.RECIPES[type])[0]; b.inv = {}; }
    if (kd === 'muelle') { b.store = {}; b.unload = []; }
    isl.buildings.push(b);
    mark(isl, b, b);
    return b;
  }

  Isl.place = tryPlace; // también sirve para pruebas desde la consola

  function removeB(isl, b) {
    mark(isl, b, null);
    isl.buildings.splice(isl.buildings.indexOf(b), 1);
    PV.Inv.refund(D.BUILD[b.type].cost, isl, 0.5);
    const back = [];
    if (b.items) for (const it of b.items) back.push(it.t);
    if (b.out) back.push(...b.out);
    for (let i = 0; i < (b.oreN || 0); i++) back.push(b.ore);
    for (let i = 0; i < (b.n || 0); i++) back.push('madera');
    if (b.hold) back.push(b.hold);
    if (b.hand) for (let i = 0; i < (b.handN || 1); i++) back.push(b.hand);
    for (const k of back) PV.Inv.add(isl.storage, k, 1);
    for (const bag of [b.inv, b.store, b.ammo]) if (bag) for (const k in bag) PV.Inv.add(isl.storage, k, bag[k]);
    if (D.base(b.type) === 'banco') PV.Bank.onRemove(isl);
  }

  function removeAt(isl, x, y) {
    const b = occAt(isl, x, y);
    if (b) removeB(isl, b);
  }

  // ---------- Simulación ----------

  // Casillas justo delante de la flecha. En los edificios de ancho par (2x2, 4x4) la flecha queda
  // entre dos casillas, así que sirven las dos.
  function frontTiles(b) {
    const def = D.BUILD[b.type], [dx, dy] = DIRS[b.dir];
    if (def.w === 1) return [[b.x + dx, b.y + dy]];
    const half = (def.w - 1) / 2;
    const fx = b.x + half + dx * (half + 1), fy = b.y + half + dy * (half + 1);
    if (Number.isInteger(fx) && Number.isInteger(fy)) return [[fx, fy]];
    // Del lado fraccionario, una casilla a cada costado del centro.
    return Number.isInteger(fx) ? [[fx, Math.floor(fy)], [fx, Math.ceil(fy)]] : [[Math.floor(fx), fy], [Math.ceil(fx), fy]];
  }
  // La casilla de adelante que tiene algo (o la primera, si no hay nada).
  function frontTile(b, isl) {
    const list = frontTiles(b);
    if (isl) for (const p of list) { const t = occAt(isl, p[0], p[1]); if (t && t !== b) return p; }
    return list[0];
  }

  function beltInsert(belt, item, dry) {
    const last = belt.items[belt.items.length - 1];
    if (last && last.p < GAP) return false;
    if (!dry) belt.items.push({ t: item, p: 0 });
    return true;
  }

  // ¿El edificio b recibe este objeto? Con dry solo pregunta, sin guardarlo.
  function accept(isl, b, item, dry) {
    switch (D.base(b.type)) {
      case 'almacen':
        if (PV.Inv.storageTotal(isl) >= PV.Inv.storageCap(isl)) return false;
        if (!dry) PV.Inv.add(isl.storage, item, 1);
        return true;
      case 'fundicion':
        if (smeltOf(b)[item] && (b.oreN === 0 || b.ore === item) && b.oreN < 10) { if (!dry) { b.ore = item; b.oreN++; } return true; }
        if (D.FUEL[item] && b.fuel < 6) { if (!dry) b.fuel += D.FUEL[item]; return true; }
        return false;
      case 'aserradero':
        if (item === 'madera' && b.n < 10) { if (!dry) b.n++; return true; }
        return false;
      case 'clasificador': case 'repartidor':
        if (b.hold) return false;
        if (!dry) b.hold = item;
        return true;
      case 'taberna':
        if (!['raciones', 'ron', 'ron_anejo'].includes(item) || (b.inv[item] || 0) >= PV.D.COLONY.tavernMax) return false;
        if (!dry) PV.Inv.add(b.inv, item, 1);
        return true;
      case 'herreria': case 'taller': case 'cocina': case 'destileria': {
        const need = D.RECIPES[b.type][b.recipe].in[item];
        if (!need || (b.inv[item] || 0) >= need * 3) return false;
        if (!dry) PV.Inv.add(b.inv, item, 1);
        return true;
      }
      case 'bateria':
        if (b.broken || !D.RAID.battery.ammo[item] || PV.Inv.sum(b.ammo) >= D.RAID.battery.max) return false;
        if (!dry) PV.Inv.add(b.ammo, item, 1);
        return true;
      case 'cartografo':
        if ((b.inv[item] || 0) >= Math.min(10, PV.Tech.need(item))) return false;
        if (!dry) PV.Inv.add(b.inv, item, 1);
        return true;
      case 'muelle':
        // El muelle de descarga no recibe de los senderos: ahí se deja lo que bajan los barcos.
        if (Isl.unloadDock(b) || PV.Inv.sum(b.store) >= Isl.dockCap(b)) return false;
        if (!dry) PV.Inv.add(b.store, item, 1);
        return true;
    }
    return false;
  }

  function give(isl, from, x, y, item, dry) {
    const t = occAt(isl, x, y);
    if (!t || t === from) return false;
    return t.type === 'cinta' ? beltInsert(t, item, dry) : accept(isl, t, item, dry);
  }

  // Modos especiales del estibador (b.filter): parado, o solo lo que pide la investigación.
  Isl.INS_NONE = '__none'; Isl.INS_TECH = '__tech';
  // Cuánto falta para la investigación de k, sin contar lo que ya va en camino en esta isla
  // (en los cartógrafos, en los senderos y en manos de los estibadores).
  function techMissing(isl, k) {
    let left = PV.Tech.need(k);
    if (left <= 0) return 0;
    for (const o of isl.buildings) {
      const kb = D.base(o.type);
      if (kb === 'cartografo') left -= (o.inv && o.inv[k]) || 0;
      else if (kb === 'cinta') { for (const it of o.items) if (it.t === k) left--; }
      else if (kb === 'insertador' && o.hand === k) left -= o.handN || 1;
    }
    return left;
  }
  function insWants(isl, b, k) {
    if (!b.filter) return true;
    if (b.filter === Isl.INS_NONE) return false;
    if (b.filter === Isl.INS_TECH) return techMissing(isl, k) > 0;
    return b.filter === k;
  }

  // El estibador toma de lo que tiene atrás algo que lo de adelante acepte.
  function grab(isl, b, src, fx, fy, only) {
    const ok = k => (!only || only === k) && insWants(isl, b, k) && give(isl, b, fx, fy, k, true);
    if (src.type === 'cinta') {
      const it = src.items[0];
      if (it && it.p >= 0.7 && ok(it.t)) { src.items.shift(); return it.t; }
    } else if (D.base(src.type) === 'almacen' || D.base(src.type) === 'muelle') {
      const bag = D.base(src.type) === 'almacen' ? isl.storage : src.store;
      for (const k of Object.keys(bag)) if (ok(k)) { PV.Inv.add(bag, k, -1); return k; }
    } else if (src.out && src.out.length && ok(src.out[0])) {
      return src.out.shift();
    }
    return null;
  }

  // Devuelve un objeto a donde lo sacó el estibador (lo de atrás). El almacén y el muelle lo reciben aunque estén llenos, porque salió de ahí.
  function giveBack(isl, b, src, item) {
    if (!src || src === b) return false;
    if (src.type === 'cinta') return beltInsert(src, item);
    const kb = D.base(src.type);
    if (kb === 'almacen') { PV.Inv.add(isl.storage, item, 1); return true; }
    if (kb === 'muelle') { PV.Inv.add(src.store, item, 1); return true; }
    if (src.out) { src.out.unshift(item); return true; }
    return accept(isl, src, item);
  }

  function pushOut(isl, b) {
    if (!b.out.length) return;
    for (const [fx, fy] of frontTiles(b)) if (give(isl, b, fx, fy, b.out[0])) { b.out.shift(); return; }
  }

  function updateBuilding(isl, b, dt) {
    if (b.broken) return;
    const g = isl.grid, def = D.BUILD[b.type], spd = spdOf(b);
    // De noche o en huelga no se trabaja; sin comida o sin taberna se trabaja más lento.
    const wk = PV.Colony.work(isl, b);
    if (wk !== 1) dt *= wk;
    switch (D.base(b.type)) {
      case 'pesqueria': {
        const pr = D.PRODUCE[b.type];
        if (b.out.length < 3) {
          b.prog += dt * pr.rate * PV.Tech.fx('mine');
          if (b.prog >= 1) { b.prog = 0; b.out.push(pr.k); }
        }
        pushOut(isl, b);
        break;
      }
      case 'extractor': case 'lenadores': case 'canaveral': case 'canaveral': {
        if (!b.out.length && !b.empty) {
          b.prog += dt * D.EXTRACT_RATE * PV.Tech.fx('mine') * spd;
          if (b.prog >= 1) {
            b.prog = 0;
            let mined = false;
            const nt = def.w * def.h;
            for (let k = 0; k < nt; k++) {
              const i = (b.ri + k) % nt;
              const idx = (b.y + Math.floor(i / def.w)) * g.w + b.x + (i % def.w);
              if (digs(b.type, g.res[idx]) && g.amt[idx] > 0) {
                b.out.push(g.res[idx]);
                // El Campamento replanta: los árboles no se agotan. La Mina profunda a veces encuentra plata.
                if (b.type !== 'campamento' && b.type !== 'canaveral' && Math.random() >= PV.Tech.fx('keep') && --g.amt[idx] <= 0) g.res[idx] = '';
                if (b.type === 'mina_profunda' && Math.random() < 0.04) b.out.push('plata');
                b.ri = i + 1;
                mined = true;
                break;
              }
            }
            if (!mined) b.empty = true;
          }
        }
        pushOut(isl, b);
        break;
      }
      case 'fundicion':
        b.on = b.out.length < 3 && b.oreN >= 2 && b.fuel >= 1;
        if (b.on) {
          b.prog += dt / 2.5 * PV.Tech.fx('fab') * spd;
          if (b.prog >= 1) {
            b.prog = 0; b.oreN -= 2; b.fuel -= 1;
            b.out.push(smeltOf(b)[b.ore]);
            if (!b.oreN) b.ore = null;
          }
        }
        pushOut(isl, b);
        break;
      case 'aserradero':
        b.on = b.out.length < 4 && b.n >= 1;
        if (b.on) {
          b.prog += dt / 1.2 * PV.Tech.fx('fab') * spd;
          if (b.prog >= 1) { b.prog = 0; b.n--; for (let i = 0; i < (b.type === 'aserradero_hid' ? 3 : 2); i++) b.out.push('tablones'); }
        }
        pushOut(isl, b);
        break;
      case 'clasificador': {
        if (!b.hold) break;
        const pass = !b.filter || b.hold === b.filter;
        for (const d of pass ? [b.dir] : [(b.dir + 1) % 4, (b.dir + 3) % 4]) {
          const [dx, dy] = DIRS[d];
          if (give(isl, b, b.x + dx, b.y + dy, b.hold)) { b.hold = null; break; }
        }
        break;
      }
      case 'repartidor': {
        // Se turna: una carga a la izquierda, la siguiente a la derecha. Si un lado no recibe, va al otro.
        if (!b.hold) break;
        const sides = [(b.dir + 3) % 4, (b.dir + 1) % 4];
        const first = b.side || 0;
        for (const s of [first, 1 - first]) {
          const [dx, dy] = DIRS[sides[s]];
          if (give(isl, b, b.x + dx, b.y + dy, b.hold)) { b.hold = null; b.side = 1 - s; break; }
        }
        break;
      }
      case 'insertador': {
        // Tarda INS_T segundos por viaje; con investigación camina más rápido y lleva varias cosas iguales.
        const [dx, dy] = DIRS[b.dir], fx = b.x + dx, fy = b.y + dy;
        if (!b.hand) {
          const src = occAt(isl, b.x - dx, b.y - dy);
          b.prog = 0;
          if (src && src !== b) {
            b.hand = grab(isl, b, src, fx, fy);
            b.handN = b.hand ? 1 : 0;
            const carry = 1 + PV.Tech.fx('carry');
            while (b.hand && b.handN < carry && grab(isl, b, src, fx, fy, b.hand)) b.handN++;
          }
        } else {
          b.prog = Math.min(1, b.prog + dt * PV.Tech.fx('ins') / INS_T);
          if (b.prog >= 1) {
            if (!b.handN) b.handN = 1; // partidas viejas
            const before = b.handN;
            while (b.handN > 0 && give(isl, b, fx, fy, b.hand)) b.handN--;
            b._w = b.handN < before ? 0 : (b._w || 0) + dt;
            // Si lo de adelante no lo recibe por un rato, lo devuelve y busca otra cosa.
            if (b.handN && b._w >= INS_BACK) {
              const src = occAt(isl, b.x - dx, b.y - dy);
              while (b.handN > 0 && giveBack(isl, b, src, b.hand)) b.handN--;
              b._w = 0;
              b._noBack = b.handN > 0;
            }
            if (!b.handN) { b.hand = null; b.prog = 0; b._noBack = false; }
          }
        }
        break;
      }
      case 'cartografo': {
        const k = Object.keys(b.inv).find(k => b.inv[k] > 0 && PV.Tech.need(k) > 0);
        b.on = !!k;
        if (b.on) {
          b.prog += dt / D.RESEARCH_T * spd;
          if (b.prog >= 1) { b.prog = 0; PV.Inv.add(b.inv, k, -1); PV.Tech.study(k); }
        }
        break;
      }
      case 'herreria': case 'taller': case 'cocina': case 'destileria': {
        const r = D.RECIPES[b.type][b.recipe];
        b.on = b.out.length < 4 && Object.keys(r.in).every(k => (b.inv[k] || 0) >= r.in[k]);
        if (b.on) {
          b.prog += dt / r.t * PV.Tech.fx('fab') * spd;
          if (b.prog >= 1) {
            b.prog = 0;
            for (const k in r.in) PV.Inv.add(b.inv, k, -r.in[k]);
            for (let i = 0; i < r.n; i++) b.out.push(r.out);
          }
        }
        pushOut(isl, b);
        break;
      }
      case 'cinta': {
        const its = b.items;
        for (let i = 0; i < its.length; i++) {
          const lim = i === 0 ? 1 : its[i - 1].p - GAP;
          its[i].p = Math.min(its[i].p + BELT_SPEED * PV.Tech.fx('belt') * dt, lim);
        }
        if (its.length && its[0].p >= 1) {
          const [dx, dy] = DIRS[b.dir];
          if (give(isl, b, b.x + dx, b.y + dy, its[0].t)) its.shift();
        }
        break;
      }
    }
  }

  // ---------- Avisos de edificios trabados ----------
  // Devuelve { ic, msg, lvl } si el edificio no puede trabajar, o null.
  // lvl: 'wait' = espera material, 'stuck' = no puede sacar lo que hizo, 'dead' = agotado / lleno.

  function outBlocked(isl, b) {
    const [fx, fy] = frontTile(b, isl), t = occAt(isl, fx, fy), it = D.RES[b.out[0]].n;
    if (!t || t === b) return { ic: '➡️', lvl: 'stuck', msg: `No tiene adónde mandar ${it}: poné un sendero o un almacén donde apunta la flecha.` };
    if (t.type === 'cinta') return { ic: '🚧', lvl: 'stuck', msg: `El sendero de adelante está lleno: la carga no avanza.` };
    return { ic: '🚧', lvl: 'stuck', msg: `${D.BUILD[t.type].n} no recibe ${it} (está lleno o no lo usa).` };
  }

  const missing = (have, need) => Object.keys(need).filter(k => (have[k] || 0) < need[k]).map(k => D.RES[k].n);

  function stuckReason(isl, b) {
    if (b.broken) return { ic: '🔥', lvl: 'dead', msg: 'Roto por los piratas: hacé clic para repararlo (' + Isl.costTxt(Isl.repairCost(b)) + ').' };
    if (PV.Colony.isWorker(b)) {
      if (PV.Colony.isNight()) return null; // de noche están en la taberna: no es un problema
      if (PV.Colony.st(isl).strike && !PV.Colony.isFood(b)) return { ic: '✊', lvl: 'wait', msg: 'Huelga: sin ron la moral está por el piso. Llevá ron a la taberna o al almacén.' };
    }
    switch (D.base(b.type)) {
      case 'pesqueria':
        return b.out.length >= 3 ? outBlocked(isl, b) : null;
      case 'taberna':
        return (b.inv.raciones || 0) + (b.inv.ron || 0) + (b.inv.ron_anejo || 0) ? null : { ic: '🍺', lvl: 'wait', msg: 'Sin raciones ni ron: mandáselos por un sendero (si no, comen de lo que haya en el almacén).' };
      case 'bateria':
        return PV.Inv.sum(b.ammo) ? null : { ic: '💤', lvl: 'wait', msg: 'Sin balas: dispara metralla débil. Mandale balas por un sendero.' };
      case 'extractor': case 'lenadores':
        if (b.out.length) return outBlocked(isl, b);
        if (b.empty) return { ic: '⛔', lvl: 'dead', msg: 'Yacimiento agotado: quitalo y ponelo sobre otro.' };
        return null;
      case 'fundicion':
        if (b.out.length >= 3) return outBlocked(isl, b);
        if (b.oreN < 2) return { ic: '💤', lvl: 'wait', msg: 'Falta mineral (necesita 2 del mismo tipo).' };
        if (b.fuel < 1) return { ic: '💤', lvl: 'wait', msg: 'Falta combustible: madera o carbón.' };
        return null;
      case 'aserradero':
        if (b.out.length >= 4) return outBlocked(isl, b);
        if (b.n < 1) return { ic: '💤', lvl: 'wait', msg: 'Falta madera: mandásela por un sendero.' };
        return null;
      case 'herreria': case 'taller': case 'cocina': case 'destileria': {
        if (b.out.length >= 4) return outBlocked(isl, b);
        const m = missing(b.inv, D.RECIPES[b.type][b.recipe].in);
        return m.length ? { ic: '💤', lvl: 'wait', msg: 'Falta: ' + m.join(', ') + '.' } : null;
      }
      case 'almacen':
        return PV.Inv.storageTotal(isl) >= PV.Inv.storageCap(isl) ? { ic: '⛔', lvl: 'dead', msg: 'Almacén lleno: cargá el barco o poné otro almacén.' } : null;
      case 'muelle':
        if (PV.Inv.sum(b.store) < Isl.dockCap(b)) return null;
        return Isl.unloadDock(b) ? { ic: '⛔', lvl: 'dead', msg: 'Muelle de descarga lleno: sacá la carga con estibadores. Lo que bajen los barcos va al almacén.' }
          : { ic: '⛔', lvl: 'dead', msg: 'Muelle lleno: pasá con el barco o con un mercante.' };
      case 'clasificador':
        return b.hold ? { ic: '🚧', lvl: 'stuck', msg: `No tiene por dónde mandar ${D.RES[b.hold].n}.` } : null;
      case 'repartidor':
        return b.hold ? { ic: '🚧', lvl: 'stuck', msg: `No puede mandar ${D.RES[b.hold].n}: poné un sendero a la izquierda o a la derecha (o están llenos).` } : null;
      case 'cartografo': {
        const cur = PV.Tech.st().cur;
        if (!cur) return { ic: '📜', lvl: 'wait', msg: 'No hay nada para investigar: hacé clic y elegí una investigación.' };
        if (b.on) return null;
        const cost = D.TECH[cur].cost;
        return { ic: '💤', lvl: 'wait', msg: 'Falta: ' + Object.keys(cost).filter(k => PV.Tech.need(k) > 0).map(k => D.RES[k].n).join(', ') + '.' };
      }
      case 'insertador':
        if (!b.hand || b.prog < 1) return null;
        return b._noBack ? { ic: '🚧', lvl: 'stuck', msg: `No puede entregar ni devolver ${D.RES[b.hand].n}: lo de adelante no lo recibe y lo de atrás está lleno.` }
          : { ic: '🚧', lvl: 'stuck', msg: `No puede dejar ${D.RES[b.hand].n}: lo de adelante no lo recibe. Si sigue así, lo devuelve.` };
    }
    return null;
  }
  Isl.stuckReason = stuckReason;

  // ---------- Edificios rotos ----------

  Isl.repairCost = function (b) {
    const c = D.BUILD[b.type].cost, out = {};
    for (const k in c) out[k] = Math.ceil(c[k] * D.RAID.repairCost);
    return out;
  };
  Isl.costTxt = c => Object.keys(c).map(k => c[k] + ' ' + (k === 'doblones' ? 'doblones' : D.RES[k].n)).join(', ');

  function repair(isl, b) {
    const c = Isl.repairCost(b);
    if (!PV.Inv.canPay(c, isl)) return PV.UI.toast('Para reparar te falta: ' + Isl.costTxt(c), 'bad');
    PV.Inv.pay(c, isl);
    b.broken = false;
    PV.UI.toast(`🔨 ${D.BUILD[b.type].n} reparado.`, 'good');
  }

  // Cada cuartel arregla gratis un edificio roto cada tanto.
  function repairByBarracks(isl, dt) {
    for (const c of isl.buildings) {
      if (c.type !== 'cuartel' || c.broken) continue;
      const b = isl.buildings.find(o => o.broken);
      if (!b) { c.rt = 0; continue; }
      c.rt = (c.rt || 0) + dt;
      if (c.rt >= D.RAID.repairEvery) {
        c.rt = 0; b.broken = false;
        if (isl === Isl.cur) PV.UI.toast(`⚔️ La guarnición reparó ${D.BUILD[b.type].n}.`, 'good');
      }
    }
  }

  Isl.updateAll = function (dt) {
    for (const isl of PV.state.islands) {
      if (!isl.owned || !isl.grid || !isl.buildings.length) continue;
      if (!isl._occ) Isl.rebuildOcc(isl);
      for (const b of isl.buildings) updateBuilding(isl, b, dt);
      repairByBarracks(isl, dt);
      if (isl !== Isl.cur) continue;
      // Solo se avisa si sigue trabado un rato, para que no parpadee.
      for (const b of isl.buildings) {
        const r = b.type === 'cinta' ? null : stuckReason(isl, b);
        b._stuckT = r ? (b._stuckT || 0) + dt : 0;
        b._warn = r && b._stuckT > 1.5 ? r : null;
      }
    }
  };

  // ---------- Muelles ----------

  Isl.dockCap = b => Math.round(D.DOCK_CAP * PV.Tech.fx('store') * ((b && D.BUILD[b.type].capMul) || 1));
  Isl.docks = isl => isl.buildings.filter(b => D.base(b.type) === 'muelle');
  // Muelle de carga (los barcos se llevan lo que traen los senderos) o de descarga (los barcos dejan la carga ahí).
  Isl.unloadDock = b => b.mode === 'descargar';
  Isl.loadDocks = isl => Isl.docks(isl).filter(d => !Isl.unloadDock(d));

  // Deja n de k en la isla: primero en los muelles de descarga y lo que no entra, en el almacén.
  // Devuelve cuánto dejó (el almacén solo recibe hasta llenarse si limit es true).
  Isl.dropAtIsland = function (isl, bag, k, n, limit) {
    let left = Math.min(n, bag[k] || 0);
    const start = left;
    for (const d of Isl.docks(isl)) {
      if (!Isl.unloadDock(d) || left <= 0) continue;
      const m = Math.min(left, Isl.dockCap(d) - PV.Inv.sum(d.store));
      if (m > 0) { PV.Inv.add(d.store, k, m); left -= m; }
    }
    const m = limit ? Math.min(left, Math.max(0, PV.Inv.storageCap(isl) - PV.Inv.storageTotal(isl))) : left;
    if (m > 0) { PV.Inv.add(isl.storage, k, m); left -= m; }
    PV.Inv.add(bag, k, -(start - left));
    return start - left;
  };

  // Pasa la carga de los muelles de carga a una bodega (cargo) con lugar libre "room".
  Isl.takeFromDocks = function (isl, cargo, room) {
    let moved = 0;
    for (const d of Isl.loadDocks(isl)) {
      for (const k of Object.keys(d.store)) {
        const n = Math.min(room - moved, d.store[k]);
        if (n <= 0) return moved;
        PV.Inv.add(d.store, k, -n); PV.Inv.add(cargo, k, n); moved += n;
      }
    }
    return moved;
  };

  // Barco del jugador cerca de la isla: carga lo del muelle. Lo marcado se baja solo
  // si unload es true (al llegar o desembarcar), así no deshace lo que cargaste a mano.
  Isl.dockSync = function (isl, unload) {
    const Inv = PV.Inv, S = PV.state;
    const loaded = Isl.takeFromDocks(isl, S.ship.cargo, Inv.cargoCap() - Inv.cargoTotal());
    let unloaded = 0;
    if (!unload) return { loaded, unloaded };
    // El Puerto propio repara el barco gratis al llegar.
    const st = PV.Sea.stats();
    if (S.ship.hp < st.maxHp && isl.buildings.some(b => b.type === 'puerto_propio')) {
      S.ship.hp = st.maxHp;
      PV.UI.toast('⚓ Los carpinteros de tu puerto repararon el barco.', 'good');
    }
    const marks = new Set();
    for (const d of Isl.docks(isl)) for (const k of d.unload || []) marks.add(k);
    for (const k of marks) if (S.ship.cargo[k]) unloaded += Isl.dropAtIsland(isl, S.ship.cargo, k, S.ship.cargo[k], true);
    return { loaded, unloaded };
  };

  // ---------- Entrar / salir ----------

  Isl.enter = function (isl) {
    Isl.ensureGrid(isl);
    Isl.cur = isl;
    Isl.sel = null; Isl.drag = null; Isl.pan = null;
    const g = isl.grid;
    Isl.cam.x = (g.w * T) / 2; Isl.cam.y = (g.h * T) / 2;
    Isl.cam.z = U.clamp(Math.min(PV.W / (g.w * T), PV.H / (g.h * T)) * 1.05, 0.5, 1.4);
    PV.state.ship.v = 0;
    PV.setScene('island');
    const r = Isl.dockSync(isl, true);
    isl._docked = true;  // al zarpar no se vuelve a descargar hasta irse y volver
    if (r.loaded || r.unloaded) PV.UI.toast(`Muelle: ${r.loaded} cargados al barco, ${r.unloaded} descargados.`, 'good');
  };

  Isl.leave = function () {
    Isl.cur = null; Isl.sel = null; Isl.drag = null;
    PV.setScene('sea');
    PV.Save.save();
  };

  Isl.select = function (type) {
    const lock = PV.Tech.buildLocked(type);
    if (lock) { Isl.sel = null; return PV.UI.toast(`🔒 ${D.BUILD[type].n}: investigá «${D.TECH[lock].n}» en un Cartógrafo (tecla I).`, 'bad'); }
    Isl.sel = Isl.sel === type ? null : type;
  };

  // Mover recursos entre el almacén de la isla y la bodega del barco.
  Isl.transfer = function (toShip) {
    const isl = Isl.cur, S = PV.state, Inv = PV.Inv;
    let moved = 0;
    if (toShip) {
      for (const k of Object.keys(isl.storage)) {
        const n = Inv.addCargo(k, isl.storage[k]);
        Inv.add(isl.storage, k, -n);
        moved += n;
      }
      if (!moved) PV.UI.toast(Inv.cargoTotal() >= Inv.cargoCap() ? 'La bodega está llena.' : 'El almacén está vacío.', 'bad');
    } else {
      let free = Inv.storageCap(isl) - Inv.storageTotal(isl);
      for (const k of Object.keys(S.ship.cargo)) {
        const n = Math.min(free, S.ship.cargo[k]);
        Inv.add(isl.storage, k, n); Inv.add(S.ship.cargo, k, -n);
        free -= n; moved += n;
      }
      if (!moved) PV.UI.toast(Inv.storageCap(isl) ? 'No hay lugar o la bodega está vacía.' : 'Construí un almacén primero.', 'bad');
    }
    if (moved) PV.UI.toast(`Se movieron ${moved} unidades.`, 'good');
  };

  // Mueve n unidades de un recurso entre el almacén de la isla y la bodega.
  Isl.move = function (k, n, toShip) {
    const isl = Isl.cur, S = PV.state, Inv = PV.Inv;
    if (!isl) return;
    if (toShip) {
      const got = Inv.addCargo(k, Math.min(n, isl.storage[k] || 0));
      Inv.add(isl.storage, k, -got);
      if (!got) PV.UI.toast('La bodega está llena.', 'bad');
    } else {
      const free = Inv.storageCap(isl) - Inv.storageTotal(isl);
      const m = Math.min(n, free, S.ship.cargo[k] || 0);
      if (m > 0) { Inv.add(S.ship.cargo, k, -m); Inv.add(isl.storage, k, m); }
      else PV.UI.toast(Inv.storageCap(isl) ? 'El almacén está lleno.' : 'Construí un almacén primero.', 'bad');
    }
  };

  // ---------- Entrada ----------

  function screenToWorld(mx, my) {
    const c = Isl.cam;
    return [(mx - PV.W / 2) / c.z + c.x, (my - PV.H / 2) / c.z + c.y];
  }
  function screenToTile(mx, my) {
    const [wx, wy] = screenToWorld(mx, my);
    return [Math.floor(wx / T), Math.floor(wy / T)];
  }
  function ghostPos(type, tx, ty) {
    const o = Math.floor((D.BUILD[type].w - 1) / 2);
    return [tx - o, ty - o];
  }

  function dragBelt(isl, tx, ty) {
    const d = Isl.drag;
    let [cx, cy] = d.last, guard = 0;
    while ((cx !== tx || cy !== ty) && guard++ < 200) {
      let nx = cx, ny = cy;
      if (Math.abs(tx - cx) >= Math.abs(ty - cy)) nx += Math.sign(tx - cx); else ny += Math.sign(ty - cy);
      const dir = DIRS.findIndex(v => v[0] === nx - cx && v[1] === ny - cy);
      Isl.dir = dir;
      const prev = occAt(isl, cx, cy);
      if (prev && prev.type === 'cinta') prev.dir = dir;
      const ex = occAt(isl, nx, ny);
      if (ex && ex.type === 'cinta') ex.dir = dir;
      else if (!ex) tryPlace(isl, 'cinta', nx, ny, dir, true);
      cx = nx; cy = ny;
    }
    d.last = [tx, ty];
  }

  Isl.onKey = function (code) {
    for (const k in D.BUILD) if (D.BUILD[k].key === code) { Isl.select(k); return; }
    if (code === 'KeyR') {
      const b = Isl.hover && occAt(Isl.cur, Isl.hover[0], Isl.hover[1]);
      if (!Isl.sel && b && D.base(b.type) !== 'almacen') b.dir = (b.dir + 1) % 4;
      else Isl.dir = (Isl.dir + 1) % 4;
    } else if (code === 'Escape' || code === 'KeyQ') {
      if (Isl.sel) Isl.sel = null; else if (code === 'Escape') Isl.leave();
    }
  };

  Isl.onMouse = function (type, e) {
    const isl = Isl.cur, c = Isl.cam;
    if (!isl) return;
    if (type === 'wheel') {
      const before = screenToWorld(e.clientX, e.clientY);
      c.z = U.clamp(c.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 2.2);
      const after = screenToWorld(e.clientX, e.clientY);
      c.x += before[0] - after[0]; c.y += before[1] - after[1];
      return;
    }
    const [tx, ty] = screenToTile(e.clientX, e.clientY);
    if (type === 'move') {
      Isl.hover = [tx, ty];
      if (Isl.pan) {
        c.x -= (e.clientX - Isl.pan[0]) / c.z; c.y -= (e.clientY - Isl.pan[1]) / c.z;
        Isl.pan = [e.clientX, e.clientY];
      }
      if (Isl.drag) {
        if (Isl.drag.mode === 'belt') dragBelt(isl, tx, ty);
        else if (Isl.drag.mode === 'wall') { if (!occAt(isl, tx, ty)) tryPlace(isl, 'empalizada', tx, ty, 0, true); }
        else removeAt(isl, tx, ty);
      }
    } else if (type === 'down') {
      PV.UI.closeChooser();
      if (e.button === 1) { Isl.pan = [e.clientX, e.clientY]; e.preventDefault(); }
      else if (e.button === 2) { removeAt(isl, tx, ty); Isl.drag = { mode: 'remove' }; }
      else if (e.button === 0 && !Isl.sel) {
        const b = occAt(isl, tx, ty);
        const kb = b && D.base(b.type);
        if (b && b.broken) repair(isl, b);
        else if (kb === 'cartografo') PV.UI.openResearch();
        else if (kb === 'banco') PV.UI.openBank();
        else if (b && PV.UI.CHOOSE[kb]) PV.UI.chooser(b, e.clientX, e.clientY);
      }
      else if (e.button === 0 && Isl.sel) {
        if (Isl.sel === 'cinta') {
          const ex = occAt(isl, tx, ty);
          if (ex && ex.type === 'cinta') ex.dir = Isl.dir;
          else tryPlace(isl, 'cinta', tx, ty, Isl.dir);
          Isl.drag = { mode: 'belt', last: [tx, ty] };
        } else {
          const [x, y] = ghostPos(Isl.sel, tx, ty);
          tryPlace(isl, Isl.sel, x, y, Isl.dir);
          if (Isl.sel === 'empalizada') Isl.drag = { mode: 'wall' };
        }
      }
    } else if (type === 'up') {
      Isl.drag = null; Isl.pan = null;
    }
  };

  Isl.update = function (dt) {
    const K = PV.Input.keys, c = Isl.cam, s = 700 / c.z * dt;
    if (K.KeyA || K.ArrowLeft) c.x -= s;
    if (K.KeyD || K.ArrowRight) c.x += s;
    if (K.KeyW || K.ArrowUp) c.y -= s;
    if (K.KeyS || K.ArrowDown) c.y += s;
  };

  // ---------- Información (tooltip) ----------

  function resUnder(isl, b) {
    const g = isl.grid, tot = {}, def = D.BUILD[b.type];
    for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
      const idx = (b.y + j) * g.w + b.x + i;
      if (digs(b.type, g.res[idx])) tot[g.res[idx]] = (tot[g.res[idx]] || 0) + g.amt[idx];
    }
    return tot;
  }

  // Partidas viejas: las minas que estaban sobre árboles pasan a ser leñadores.
  Isl.migrate = function (isl) {
    const g = isl.grid;
    for (const b of isl.buildings) {
      if (b.type !== 'extractor') continue;
      let wood = 0, other = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const k = g.res[(b.y + j) * g.w + b.x + i];
        if (k === 'madera') wood++; else if (k) other++;
      }
      if (wood > other) { b.type = 'lenadores'; b.empty = false; }
    }
  };

  const recipeTxt = r => Object.keys(r.in).map(k => r.in[k] + ' ' + D.RES[k].n).join(' + ') + ' → ' + r.n + ' ' + D.RES[r.out].n;
  Isl.recipeTxt = recipeTxt;

  Isl.tooltip = function () {
    const isl = Isl.cur;
    if (!isl || !Isl.hover) return '';
    const [tx, ty] = Isl.hover, g = isl.grid;
    if (!inside(isl, tx, ty)) return '';
    const b = occAt(isl, tx, ty);
    if (b) {
      const def = D.BUILD[b.type], kb = D.base(b.type);
      let s = `<b>${def.icon} ${def.n}</b><br>`;
      if (def.of) s += `<span style="color:#f5d76e">★ ${def.desc}</span><br>`;
      if (b.broken) s += `<span style="color:#ff7b6b">🔥 Roto. Clic para reparar: ${Isl.costTxt(Isl.repairCost(b))}</span><br>`;
      if (b._warn) s += `<span style="color:${b._warn.lvl === 'wait' ? '#f1c40f' : '#ff7b6b'}">${b._warn.ic} ${b._warn.msg}</span><br>`;
      if (isDigger(b.type)) {
        const tot = resUnder(isl, b), keys = Object.keys(tot);
        s += b.type === 'canaveral' ? `Caña cultivada: nunca se agota · ${(D.EXTRACT_RATE * 60 * PV.Tech.fx('mine')).toFixed(0)} por minuto de día` : keys.length ? keys.map(k => `${D.RES[k].n}: quedan ${tot[k]}`).join('<br>') : '<span style="color:#e74c3c">Yacimiento agotado</span>';
      } else if (kb === 'fundicion') {
        s += `Mineral: ${b.oreN ? D.RES[b.ore].n + ' ×' + b.oreN : '—'}<br>Combustible: ${b.fuel}`;
        s += b.on ? '<br>🔥 Fundiendo…' : '<br><i>Necesita 2 minerales y combustible (madera o carbón).</i>';
      } else if (kb === 'aserradero') {
        s += `Madera: ${b.n}` + (b.on ? '<br>🪚 Cortando…' : '<br><i>Mandale madera por un sendero.</i>');
      } else if (kb === 'almacen') {
        s += `Almacén de la isla: ${PV.Inv.storageTotal(isl)} / ${PV.Inv.storageCap(isl)}`;
      } else if (b.type === 'cinta') {
        s += `Porteadores con carga: ${b.items.length}`;
      } else if (kb === 'clasificador') {
        s += `Sigue derecho: <b>${b.filter ? D.RES[b.filter].n : 'todo'}</b><br>El resto sale por los costados.<br><i>Clic para elegir.</i>`;
      } else if (kb === 'repartidor') {
        s += `Recibe por atrás y reparte en 2 caminos: izquierda y derecha, una y una.<br>Si un lado está lleno, manda todo al otro.<br><i>Tecla R para girarlo antes de ponerlo.</i>`;
      } else if (kb === 'insertador') {
        const what = b.filter === Isl.INS_NONE ? 'nada (está parado)' : b.filter === Isl.INS_TECH ? 'lo que pide la investigación' : b.filter ? D.RES[b.filter].n : 'cualquier cosa';
        s += `Agarra: <b>${what}</b>` + (b.hand ? `<br>Lleva: ${D.RES[b.hand].n} ×${b.handN || 1}` : '') +
          `<br>${(INS_T / PV.Tech.fx('ins')).toFixed(2)} s por viaje · hasta ${1 + PV.Tech.fx('carry')} por vez<br><i>Clic para filtrar.</i>`;
      } else if (D.PRODUCE[b.type]) {
        const pr = D.PRODUCE[b.type];
        s += `Saca <b>${D.RES[pr.k].n}</b>: ${(pr.rate * 60 * PV.Tech.fx('mine')).toFixed(0)} por minuto de día`;
      } else if (kb === 'taberna') {
        const C = D.COLONY;
        s += `Raciones: ${b.inv.raciones || 0} / ${C.tavernMax} · Ron: ${b.inv.ron || 0} / ${C.tavernMax}${b.inv.ron_anejo ? ' · Ron añejo: ' + b.inv.ron_anejo : ''}<br>Lugares: ${C.seats} trabajadores<br><i>De noche tu gente viene a comer y tomar ron. Si no alcanza, comen del almacén.</i>`;
      } else if (D.RECIPES[b.type]) {
        const r = D.RECIPES[b.type][b.recipe];
        s += `Receta: <b>${recipeTxt(r)}</b><br>Tiene: ${Object.keys(r.in).map(k => D.RES[k].n + ' ' + (b.inv[k] || 0) + '/' + r.in[k]).join(', ')}`;
        s += b.on ? '<br>🔨 Trabajando…' : Object.keys(D.RECIPES[b.type]).length > 1 ? '<br><i>Clic para cambiar la receta.</i>' : '';
      } else if (kb === 'bateria') {
        const am = Object.keys(b.ammo).filter(k => b.ammo[k] > 0);
        s += `Munición: ${am.length ? am.map(k => D.RES[k].n + ' ' + b.ammo[k]).join(', ') : 'ninguna (metralla débil)'} / ${D.RAID.battery.max}<br>Alcance: ${D.RAID.battery.range} · daño ${D.RAID.battery.ammo.balas} con balas, ${D.RAID.battery.ammo.bala_explosiva} con explosivas`;
      } else if (kb === 'empalizada' || kb === 'cuartel' || kb === 'torre_vigia') {
        s += `${def.desc}<br>Protección de la isla contra saqueo: <b>${Math.round(PV.Raid.protection(isl) * 100)}%</b>`;
      } else if (kb === 'banco') {
        const bk = PV.Bank.of(isl);
        s += `Guardado: <b>${U.fmt(Math.floor(bk.saved))}</b> doblones<br>Interés: ${(PV.Bank.rate(isl) * 100).toFixed(1).replace('.', ',')}% por minuto (hasta ${U.fmt(PV.Bank.cap(isl))})` + (bk.inv.length ? `<br>Inversiones en curso: ${bk.inv.length}` : '') + '<br><i>Clic para abrir el banco.</i>';
      } else if (kb === 'cartografo') {
        const cur = PV.Tech.st().cur, inv = Object.keys(b.inv).filter(k => b.inv[k] > 0);
        s += cur ? `Investigando: <b>${D.TECH[cur].n}</b> (${Math.round(PV.Tech.progress(cur) * 100)}%)` : 'Sin investigación elegida.';
        if (inv.length) s += '<br>En la mesa: ' + inv.map(k => D.RES[k].n + ' ' + b.inv[k]).join(', ');
        s += '<br><i>Clic para abrir la investigación.</i>';
      } else if (kb === 'muelle') {
        s += (Isl.unloadDock(b) ? '<b>📥 Muelle de descarga</b>: los barcos dejan acá lo que bajan. Sacalo con estibadores.<br>' : '<b>📤 Muelle de carga</b>: los barcos se llevan lo que traen los senderos.<br>')
          + `${Isl.unloadDock(b) ? 'Carga descargada' : 'Carga esperando'}: ${PV.Inv.sum(b.store)} / ${Isl.dockCap(b)}` + (b.unload.length ? `<br>Descarga del barco: ${b.unload.map(k => D.RES[k].n).join(', ')}` : '') + '<br><i>Clic para cambiar de modo, elegir qué descargar y manejar balandras.</i>';
      }
      if (PV.Colony.isWorker(b)) s += `<br>👷 ${PV.Colony.crewOf(b)} trabajador${PV.Colony.crewOf(b) > 1 ? 'es' : ''}${PV.Colony.isNight() ? ' (en la taberna)' : ''}`;
      return s + '<br><span style="opacity:.7">R rotar · clic derecho quitar</span>';
    }
    const idx = ty * g.w + tx;
    if (g.res[idx]) return `<b>${D.RES[g.res[idx]].n}</b><br>Quedan: ${g.amt[idx]}`;
    return '';
  };

  // ---------- Dibujo ----------

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Globito con ícono sobre un edificio trabado.
  const WARN_COL = { wait: '#f1c40f', stuck: '#e67e22', dead: '#e74c3c' };
  function drawWarn(ctx, b, t) {
    const def = D.BUILD[b.type];
    const x = (b.x + def.w / 2) * T, y = b.y * T + 2 + Math.sin(t * 3 + b.id) * 2;
    const r = def.w === 1 ? 8 : 11;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 1, y + 2, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fdf3dc'; ctx.strokeStyle = WARN_COL[b._warn.lvl]; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.font = (r * 1.15 | 0) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b._warn.ic, x, y + 1);
    ctx.restore();
  }

  function drawArrow(ctx, b) {
    const def = D.BUILD[b.type], [dx, dy] = DIRS[b.dir];
    const cx = (b.x + def.w / 2) * T, cy = (b.y + def.h / 2) * T;
    const off = (def.w / 2) * T - 7;
    ctx.save();
    ctx.translate(cx + dx * off, cy + dy * off);
    ctx.rotate(b.dir * Math.PI / 2);
    ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Persona vista desde arriba, mirando hacia el ángulo a.
  function drawPerson(ctx, x, y, a, shirt, swing, hat) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(1.5, 2, 5, 6.5, 0, 0, TAU); ctx.fill();
    const sw = Math.sin(swing || 0) * 2.5;
    ctx.fillStyle = '#d9a877';
    ctx.beginPath(); ctx.arc(1 + sw, -5.2, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1 - sw, 5.2, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 5.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9a877'; ctx.beginPath(); ctx.arc(0.5, 0, 2.8, 0, TAU); ctx.fill();
    ctx.fillStyle = hat || '#5a3a1e'; ctx.beginPath(); ctx.arc(-0.3, 0, 2.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    ctx.restore();
  }

  // Trabajador con herramienta (pico, hacha, martillo) que se mueve si está trabajando.
  function drawWorker(ctx, x, y, a, shirt, swing, tool) {
    if (Isl._night) return;
    drawPerson(ctx, x, y, a, shirt, 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.sin(swing) * 0.7);
    ctx.strokeStyle = '#6d4c2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(12, 4); ctx.stroke();
    ctx.fillStyle = tool === 'hacha' ? '#b0b6bb' : '#7d858c';
    if (tool === 'pico') ctx.fillRect(11, -0.5, 2.5, 9);
    else if (tool === 'hacha') ctx.fillRect(10, 4, 4, 4);
    else ctx.fillRect(10.5, 1, 4, 6);
    ctx.restore();
  }

  function drawBundle(ctx, x, y, k, s) {
    s = s || 4.5;
    ctx.fillStyle = D.RES[k].c; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2;
    rrect(ctx, x - s, y - s, s * 2, s * 2, 2.5); ctx.fill(); ctx.stroke();
  }

  // Porteador caminando con un bulto en la cabeza.
  function drawPorter(ctx, x, y, dir, k, t) {
    drawPerson(ctx, x, y, dir * Math.PI / 2, '#8a6d4a', t * 9 + (x + y) * 0.3);
    drawBundle(ctx, x, y, k);
  }

  // Sendero de tierra (la "cinta"): marcas de pisadas hacia la flecha.
  function drawBelt(ctx, b) {
    const px = b.x * T, py = b.y * T;
    ctx.fillStyle = '#b8925f'; ctx.fillRect(px, py, T, T);
    ctx.save();
    ctx.translate(px + T / 2, py + T / 2);
    ctx.rotate(b.dir * Math.PI / 2);
    ctx.fillStyle = 'rgba(80,55,25,0.25)';
    ctx.fillRect(-T / 2, -T / 2, T, 3); ctx.fillRect(-T / 2, T / 2 - 3, T, 3);
    ctx.fillStyle = 'rgba(120,90,50,0.6)';
    for (let i = 0; i < 3; i++) {
      const h = U.hash(b.x * 7 + i, b.y * 13 - i);
      ctx.beginPath(); ctx.arc(-12 + h * 24, -9 + U.hash(b.y + i, b.x) * 18, 1.4, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,60,30,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const x of [-6, 6]) { ctx.moveTo(x - 3, -5); ctx.lineTo(x + 2, 0); ctx.lineTo(x - 3, 5); }
    ctx.stroke();
    ctx.restore();
  }

  function drawItem(ctx, x, y, k) { drawBundle(ctx, x, y, k, 5); }

  function floor(ctx, px, py, w, h, fill, line) {
    ctx.fillStyle = fill; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 7); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
  }

  const NO_ARROW = ['repartidor', 'taberna', 'almacen', 'muelle', 'cartografo', 'banco', 'bateria', 'empalizada', 'cuartel', 'torre_vigia'];
  // Cartel del muelle: "Carga" (verde) o "Descarga" (azul).
  function drawDockSign(ctx, b) {
    const down = Isl.unloadDock(b), label = down ? '📥 Descarga' : '📤 Carga';
    ctx.font = 'bold 10px Georgia';
    const tw = ctx.measureText(label).width + 8, x = b.x * T + 2, y = b.y * T - 7;
    ctx.fillStyle = down ? '#2471a3' : '#1e8449'; ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1;
    rrect(ctx, x, y, tw, 13, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, x + 4, y + 10);
  }

  function drawMachine(ctx, b, isl, t) {
    const def = D.BUILD[b.type], px = b.x * T, py = b.y * T, w = def.w * T, h = def.h * T;
    if (def.of) return drawEvolved(ctx, b, isl, t, def);
    const cx = px + w / 2, cy = py + h / 2;
    const busy = isl ? t * 8 + (b.id || 0) : 0;
    if (def.w > 1) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(ctx, px + 5, py + 6, w - 6, h - 6, 6); ctx.fill(); }

    if (DIGGERS[b.type] && b.type !== 'canaveral') {
      const tot = isl ? resUnder(isl, b) : {};
      const main = Object.keys(tot).sort((a, c) => tot[c] - tot[a])[0];
      const working = isl && !b.empty && !(b.out && b.out.length);
      const sw = working ? busy : 0;
      if (b.type === 'lenadores') {
        // Campamento de leñadores: troncos apilados y tocones.
        floor(ctx, px, py, w, h, '#6f9445', '#3f5a26');
        ctx.fillStyle = '#2e6b2a'; ctx.beginPath(); ctx.arc(px + 22, py + 22, 14, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3f8a36'; ctx.beginPath(); ctx.arc(px + 18, py + 18, 7, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#7a5230'; rrect(ctx, cx - 6, cy + 4 + i * 7, 34, 6, 3); ctx.fill();
          ctx.fillStyle = '#c9a26b'; ctx.beginPath(); ctx.arc(cx - 6, cy + 7 + i * 7, 3, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#8a6440'; ctx.beginPath(); ctx.arc(px + w - 20, py + 20, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c9a26b'; ctx.beginPath(); ctx.arc(px + w - 20, py + 20, 3.5, 0, TAU); ctx.fill();
        drawWorker(ctx, px + 40, py + 24, Math.PI, '#7b3f2a', sw, 'hacha');
        drawWorker(ctx, px + 22, py + h - 22, -Math.PI / 2, '#3d5a80', sw + 1.5, 'hacha');
      } else {
        // Boca de mina en la roca, con vigas y una vagoneta.
        floor(ctx, px, py, w, h, '#8a7a62', '#4e4232');
        ctx.fillStyle = '#6d6458'; ctx.beginPath(); ctx.ellipse(cx, cy - 10, 36, 24, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5c544a'; ctx.beginPath(); ctx.ellipse(cx - 12, cy - 18, 14, 9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1b1410';
        ctx.beginPath(); ctx.moveTo(cx - 11, cy + 2); ctx.lineTo(cx - 11, cy - 8); ctx.arc(cx, cy - 8, 11, Math.PI, 0); ctx.lineTo(cx + 11, cy + 2); ctx.fill();
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(cx - 15, cy - 20, 4, 23); ctx.fillRect(cx + 11, cy - 20, 4, 23); ctx.fillRect(cx - 16, cy - 22, 32, 4);
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - 4, cy + 2); ctx.lineTo(cx - 4, py + h - 6); ctx.moveTo(cx + 4, cy + 2); ctx.lineTo(cx + 4, py + h - 6); ctx.stroke();
        ctx.fillStyle = '#5a4632'; rrect(ctx, cx - 7, cy + 14, 14, 11, 2); ctx.fill();
        ctx.fillStyle = main ? D.RES[main].c : '#999';
        ctx.beginPath(); ctx.arc(cx - 3, cy + 16, 3, 0, TAU); ctx.arc(cx + 3, cy + 17, 3, 0, TAU); ctx.fill();
        drawWorker(ctx, px + 20, py + h - 22, -Math.PI / 2, '#7b3f2a', sw, 'pico');
        drawWorker(ctx, px + w - 20, py + h - 24, -Math.PI / 2 - 0.4, '#556b2f', sw + 2, 'pico');
      }
      if (b.empty) {
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(px + 20, py + 20); ctx.lineTo(px + w - 20, py + h - 20);
        ctx.moveTo(px + w - 20, py + 20); ctx.lineTo(px + 20, py + h - 20); ctx.stroke();
      }
    } else if (b.type === 'fundicion') {
      floor(ctx, px, py, w, h, '#8e3b2e', '#4a1d16');
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let r = 1; r < 6; r++) { ctx.beginPath(); ctx.moveTo(px + 4, py + r * 16); ctx.lineTo(px + w - 4, py + r * 16); ctx.stroke(); }
      const glow = b.on ? 0.6 + Math.sin(t * 12) * 0.2 : 0.1;
      ctx.fillStyle = '#2a1410'; rrect(ctx, cx - 18, cy - 12, 36, 26, 10); ctx.fill();
      ctx.fillStyle = `rgba(255,${120 + Math.floor(glow * 80)},30,${glow})`; rrect(ctx, cx - 14, cy - 8, 28, 18, 8); ctx.fill();
      ctx.fillStyle = '#3d3d3d'; ctx.beginPath(); ctx.arc(px + w - 18, py + 18, 9, 0, TAU); ctx.fill();
      if (b.on) {
        ctx.fillStyle = 'rgba(90,90,90,0.4)';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.8 + i / 3) % 1;
          ctx.beginPath(); ctx.arc(px + w - 18 + ph * 8, py + 18 - ph * 30, 5 + ph * 7, 0, TAU); ctx.fill();
        }
      }
      drawWorker(ctx, cx, py + h - 16, -Math.PI / 2, '#5a3a1e', b.on ? busy * 0.6 : 0, 'pico');
    } else if (b.type === 'aserradero') {
      floor(ctx, px, py, w, h, '#9a6a3a', '#4e3115');
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(px + i * 16, py + 4); ctx.lineTo(px + i * 16, py + h - 4); ctx.stroke(); }
      ctx.save(); ctx.translate(cx, cy - 6); ctx.rotate(b.on ? t * 10 : 0);
      ctx.fillStyle = '#c8ccd0'; ctx.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = k % 2 ? 20 : 15; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
      drawWorker(ctx, px + 22, py + h - 18, -Math.PI / 2, '#3d5a80', b.on ? busy : 0, 'martillo');
      drawWorker(ctx, px + w - 22, py + h - 18, -Math.PI / 2, '#7b3f2a', b.on ? busy + 2 : 0, 'martillo');
    } else if (b.type === 'almacen') {
      ctx.fillStyle = '#a5713e'; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 4); ctx.fill();
      ctx.strokeStyle = '#5e3b1c'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + w - 6, py + h - 6);
      ctx.moveTo(px + w - 6, py + 6); ctx.lineTo(px + 6, py + h - 6); ctx.stroke();
      if (isl) {
        const cap = PV.Inv.storageCap(isl), f = cap ? PV.Inv.storageTotal(isl) / cap : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px + 6, py + h - 10, w - 12, 5);
        ctx.fillStyle = f > 0.9 ? '#e74c3c' : '#58d26b'; ctx.fillRect(px + 6, py + h - 10, (w - 12) * Math.min(1, f), 5);
      }
    } else if (b.type === 'herreria') {
      // Piso de piedra, fragua encendida, yunque y el herrero con su martillo.
      floor(ctx, px, py, w, h, '#7d7268', '#3f3a35');
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { ctx.strokeRect(px + i * 32 - 32 + 4, py + 4, 32, h - 8); }
      const glow = b.on ? 0.65 + Math.sin(t * 10) * 0.2 : 0.15;
      ctx.fillStyle = '#3a3330'; ctx.beginPath(); ctx.arc(px + w - 22, py + 22, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,140,40,${glow})`; ctx.beginPath(); ctx.arc(px + w - 22, py + 22, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2b2b'; rrect(ctx, cx - 14, cy + 2, 28, 10, 3); ctx.fill();
      ctx.fillStyle = '#444'; ctx.fillRect(cx - 5, cy + 12, 10, 8);
      drawWorker(ctx, cx, cy - 12, Math.PI / 2, '#5a3a1e', b.on ? busy * 1.3 : 0, 'martillo');
      ctx.fillStyle = '#4a4f55';
      for (let i = 0; i < Math.min(4, (b.out || []).length); i++) { ctx.beginPath(); ctx.arc(px + 14 + i * 7, py + h - 14, 3, 0, TAU); ctx.fill(); }
    } else if (b.type === 'taller') {
      // Tablones, mesa de trabajo, barriles y dos artesanos.
      floor(ctx, px, py, w, h, '#b08a5a', '#5e3b1c');
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + i * 12); ctx.lineTo(px + w - 4, py + i * 12); ctx.stroke(); }
      ctx.fillStyle = '#6b4423'; rrect(ctx, cx - 22, cy - 8, 44, 16, 3); ctx.fill();
      const r = b.recipe && D.RECIPES.taller[b.recipe];
      if (r) { drawBundle(ctx, cx - 10, cy, Object.keys(r.in)[0], 3.5); drawBundle(ctx, cx + 10, cy, r.out, 3.5); }
      for (const [bx, by] of [[px + 14, py + 14], [px + 26, py + 12]]) {
        ctx.fillStyle = '#7a5230'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      drawWorker(ctx, cx - 12, cy + 18, -Math.PI / 2, '#7b3f2a', b.on ? busy : 0, 'martillo');
      drawWorker(ctx, cx + 12, cy - 18, Math.PI / 2, '#556b2f', b.on ? busy + 2 : 0, 'martillo');
    } else if (b.type === 'muelle') {
      // Tablas sobre pilotes y cajones apilados esperando el barco.
      ctx.fillStyle = '#9a6b3d'; ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(40,25,10,0.45)'; ctx.lineWidth = 1.5;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(px + i * 8, py + 1); ctx.lineTo(px + i * 8, py + h - 1); ctx.stroke(); }
      ctx.fillStyle = '#4a3020';
      for (const [ox, oy] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { ctx.beginPath(); ctx.arc(px + ox, py + oy, 4, 0, TAU); ctx.fill(); }
      const keys = b.store ? Object.keys(b.store).sort((a, c) => b.store[c] - b.store[a]).slice(0, 4) : [];
      keys.forEach((k, i) => drawBundle(ctx, px + 20 + (i % 2) * 24, py + 20 + Math.floor(i / 2) * 24, k, 7));
      ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center';
      if (!keys.length) ctx.fillText('⚓', cx, cy + 5);
    } else if (b.type === 'bateria') {
      // Plataforma de piedra con un cañón, barriles de pólvora y el artillero.
      floor(ctx, px, py, w, h, '#8a8278', '#4e463a');
      ctx.fillStyle = '#6d655a'; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4e463a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.dir * Math.PI / 2);
      ctx.fillStyle = '#5a3a1e'; rrect(ctx, -10, -8, 18, 16, 3); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; rrect(ctx, -4, -4, 26, 8, 3); ctx.fill();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-4, 0, 6, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#7a5230';
      for (const [bx, by] of [[px + 9, py + h - 10], [px + 18, py + h - 8]]) { ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill(); }
      const n = b.ammo ? Math.min(6, PV.Inv.sum(b.ammo)) : 0;
      ctx.fillStyle = '#2b2b2b';
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(px + w - 10 - (i % 3) * 6, py + 9 + Math.floor(i / 3) * 6, 2.6, 0, TAU); ctx.fill(); }
      drawPerson(ctx, px + w - 14, py + h - 14, -Math.PI * 0.75, '#2c3e50', 0, '#1a1a1a');
    } else if (b.type === 'empalizada') {
      // Troncos clavados con punta.
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 3, py + 5, T - 4, T - 6);
      for (let i = 0; i < 4; i++) {
        const lx = px + 3 + i * 7;
        ctx.fillStyle = i % 2 ? '#7a5230' : '#8b6239'; rrect(ctx, lx, py + 6, 6, T - 8, 2); ctx.fill();
        ctx.fillStyle = '#c9a26b'; ctx.beginPath(); ctx.arc(lx + 3, py + 7, 2.6, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 2, py + T * 0.55); ctx.lineTo(px + T - 2, py + T * 0.55); ctx.stroke();
    } else if (b.type === 'cuartel') {
      // Campamento militar: carpas, fogata, armas y soldados de guardia.
      floor(ctx, px, py, w, h, '#8f8a5a', '#4e4a2a');
      for (const [tx, ty, c] of [[px + 22, py + 22, '#c8b48a'], [px + w - 22, py + 22, '#b8a47a']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(tx, ty - 16); ctx.lineTo(tx + 16, ty + 12); ctx.lineTo(tx - 16, ty + 12); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, ty - 16); ctx.lineTo(tx, ty + 12); ctx.stroke();
      }
      ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.arc(cx, cy + 14, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,140,40,${0.6 + Math.sin(t * 9) * 0.2})`; ctx.beginPath(); ctx.arc(cx, cy + 14, 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + 12 + i * 5, py + h - 8); ctx.lineTo(px + 14 + i * 5, py + h - 26); ctx.stroke(); }
      const march = isl ? Math.sin(t * 1.5) * 10 : 0;
      drawPerson(ctx, cx - 18 + march, py + h - 18, 0, '#8e1b1b', isl ? t * 6 : 0, '#1a1a1a');
      drawPerson(ctx, cx + 18 - march, py + h - 18, Math.PI, '#8e1b1b', isl ? t * 6 + 2 : 0, '#1a1a1a');
      drawPerson(ctx, px + w - 14, cy + 6, -Math.PI / 2, '#8e1b1b', 0, '#1a1a1a');
    } else if (b.type === 'pesqueria') {
      // Muelle de pesca: tablas, redes colgadas, una canasta con pescado y el pescador con su caña.
      floor(ctx, px, py, w, h, '#9c7a4e', '#5e3b1c');
      ctx.strokeStyle = 'rgba(60,35,15,0.35)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + i * 10.5); ctx.lineTo(px + w - 4, py + i * 10.5); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(230,220,190,0.8)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(px + 8 + i * 5, py + 8); ctx.lineTo(px + 8 + i * 5, py + 30);
        ctx.moveTo(px + 8, py + 10 + i * 5); ctx.lineTo(px + 30, py + 10 + i * 5); ctx.stroke();
      }
      ctx.fillStyle = '#7a5230'; ctx.beginPath(); ctx.ellipse(px + w - 16, py + h - 16, 9, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7fb3d5';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(px + w - 20 + i * 4, py + h - 18 + (i % 2) * 3, 3.5, 1.6, 0.4, 0, TAU); ctx.fill(); }
      const bob = isl && !Isl._night ? Math.sin(t * 2 + (b.id || 0)) * 3 : 0;
      drawWorker(ctx, px + w - 18, py + 18, -0.6, '#3d5a80', 0, 'none');
      if (!Isl._night) {
        ctx.strokeStyle = '#5e3b1c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px + w - 14, py + 14); ctx.lineTo(px + w + 10, py - 8); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(px + w + 10, py - 8); ctx.lineTo(px + w + 12, py + 6 + bob); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(px + w + 12, py + 7 + bob, 2, 0, TAU); ctx.fill();
      }
    } else if (b.type === 'canaveral') {
      // Surcos de caña de azúcar y un cortador con machete.
      floor(ctx, px, py, w, h, '#7a6a3a', '#4e4226');
      for (let r = 0; r < 5; r++) {
        const yy = py + 12 + r * 18;
        ctx.fillStyle = 'rgba(60,45,20,0.4)'; ctx.fillRect(px + 6, yy + 4, w - 12, 3);
        for (let i = 0; i < 9; i++) {
          const xx = px + 10 + i * 9.5, sway = isl ? Math.sin(t * 1.6 + i + r) * 1.5 : 0;
          ctx.strokeStyle = '#5f8f2f'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(xx, yy + 5); ctx.lineTo(xx + sway, yy - 6); ctx.stroke();
          ctx.fillStyle = '#a9cc5b'; ctx.beginPath(); ctx.ellipse(xx + sway, yy - 7, 3.5, 1.5, -0.6, 0, TAU); ctx.fill();
        }
      }
      drawWorker(ctx, px + 24, py + h - 14, -Math.PI / 2, '#a04000', busy, 'hacha');
      drawWorker(ctx, px + w - 26, py + 28, Math.PI / 2, '#556b2f', busy + 2, 'hacha');
    } else if (b.type === 'cocina') {
      // Cocina al aire libre: olla grande sobre el fuego, mesa con pescado y el cocinero.
      floor(ctx, px, py, w, h, '#a39b8b', '#5a5246');
      ctx.fillStyle = '#6b4423'; rrect(ctx, px + 6, py + 6, 22, 12, 2); ctx.fill();
      ctx.fillStyle = '#7fb3d5'; ctx.beginPath(); ctx.ellipse(px + 13, py + 12, 4, 2, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8925a'; ctx.beginPath(); ctx.arc(px + 22, py + 12, 3, 0, TAU); ctx.fill();
      const fire = b.on ? 0.7 + Math.sin(t * 13) * 0.2 : 0.25;
      ctx.fillStyle = `rgba(255,120,30,${fire})`; ctx.beginPath(); ctx.arc(cx + 8, cy + 10, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(cx + 8, cy + 8, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b9945a'; ctx.beginPath(); ctx.arc(cx + 8, cy + 8, 7.5, 0, TAU); ctx.fill();
      if (b.on) {
        ctx.fillStyle = 'rgba(240,240,240,0.35)';
        for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i / 3) % 1; ctx.beginPath(); ctx.arc(cx + 8 + Math.sin(ph * 6) * 3, cy + 4 - ph * 26, 3 + ph * 6, 0, TAU); ctx.fill(); }
      }
      drawWorker(ctx, px + 14, py + h - 14, -0.4, '#f4f1e1', b.on ? busy * 0.5 : 0, 'none');
    } else if (b.type === 'destileria') {
      // Alambique de cobre con su serpentín, barriles de ron y el destilador.
      floor(ctx, px, py, w, h, '#8a6a4a', '#4a3020');
      ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.arc(cx - 12, cy + 4, 18, 0, TAU); ctx.fill();
      const glow = b.on ? 0.55 + Math.sin(t * 11) * 0.2 : 0.15;
      ctx.fillStyle = `rgba(255,120,30,${glow})`; ctx.beginPath(); ctx.arc(cx - 12, cy + 10, 10, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#c87533'; ctx.beginPath(); ctx.arc(cx - 12, cy, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e59866'; ctx.beginPath(); ctx.arc(cx - 16, cy - 4, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 2, cy - 8); ctx.quadraticCurveTo(cx + 14, cy - 22, cx + 22, cy - 8); ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cx + 22, cy - 4 + i * 6, 7, 2.5, 0, 0, TAU); ctx.stroke(); }
      for (let i = 0; i < 3; i++) {
        const bx = px + 14 + i * 16, by = py + h - 14;
        ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.arc(bx, by, 4, 0, TAU); ctx.stroke();
      }
      drawWorker(ctx, px + w - 18, py + h - 20, Math.PI, '#5a3a1e', b.on ? busy * 0.5 : 0, 'none');
    } else if (b.type === 'taberna') {
      // Taberna: piso de madera, barra, barriles, mesas con bancos. De noche se llena de gente.
      floor(ctx, px, py, w, h, '#8b5e34', '#4a2e14');
      ctx.strokeStyle = 'rgba(40,20,5,0.3)'; ctx.lineWidth = 1;
      for (let i = 1; i < 9; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + i * 10.5); ctx.lineTo(px + w - 4, py + i * 10.5); ctx.stroke(); }
      ctx.fillStyle = '#5e3b1c'; rrect(ctx, px + 6, py + 6, w - 12, 12, 3); ctx.fill();
      ctx.fillStyle = '#7a4a22';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px + w - 14 - i * 12, py + 12, 5, 0, TAU); ctx.fill(); }
      const tables = [[px + 28, py + 46], [px + w - 28, py + 46], [cx, py + h - 22]];
      for (const [tx, ty] of tables) {
        ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.arc(tx, ty, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#d4a017'; ctx.beginPath(); ctx.arc(tx - 3, ty - 2, 2, 0, TAU); ctx.arc(tx + 3, ty + 2, 2, 0, TAU); ctx.fill();
      }
      drawPerson(ctx, px + 20, py + 12, Math.PI / 2, '#f4f1e1', isl ? Math.sin(t * 2) : 0, '#5a3a1e');
      const crowd = isl ? Math.round(PV.Colony.dark() * 9) : 0;
      const shirts = ['#7b3f2a', '#3d5a80', '#556b2f', '#a04000', '#2c3e50', '#8e1b1b'];
      for (let i = 0; i < crowd; i++) {
        const [tx, ty] = tables[i % 3], a = (i / 3) * 2.1 + (i % 3);
        drawPerson(ctx, tx + Math.cos(a) * 14, ty + Math.sin(a) * 14, a + Math.PI, shirts[i % shirts.length], t * 4 + i, '#3b2410');
      }
      ctx.fillStyle = '#5e3b1c'; ctx.fillRect(px + w - 6, py + h - 30, 3, 26);
      ctx.fillStyle = '#d4a017'; rrect(ctx, px + w - 22, py + h - 30, 16, 10, 2); ctx.fill();
      ctx.fillStyle = '#5e3b1c'; ctx.font = 'bold 8px Georgia'; ctx.textAlign = 'center'; ctx.fillText('RON', px + w - 14, py + h - 22);
    } else if (b.type === 'torre_vigia') {
      // Torre de madera vista desde arriba con el vigía y su catalejo.
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 5, py + 6, T - 6, T - 6);
      ctx.fillStyle = '#7a5230'; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 3, py + 3, T - 6, T - 6);
      ctx.beginPath(); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + T - 3, py + T - 3); ctx.moveTo(px + T - 3, py + 3); ctx.lineTo(px + 3, py + T - 3); ctx.stroke();
      const look = isl ? t * 0.8 : -0.6;
      drawPerson(ctx, cx, cy, look, '#2c3e50', 0, '#7a1f1f');
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(look) * 4, cy + Math.sin(look) * 4); ctx.lineTo(cx + Math.cos(look) * 11, cy + Math.sin(look) * 11); ctx.stroke();
    } else if (b.type === 'banco') {
      // Casa del banquero: piso de piedra, mostrador, cofre con monedas y el banquero de galera.
      floor(ctx, px, py, w, h, '#9a8f7e', '#4e463a');
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + i * 16, py + 3); ctx.lineTo(px + i * 16, py + h - 3); ctx.moveTo(px + 3, py + i * 16); ctx.lineTo(px + w - 3, py + i * 16); ctx.stroke(); }
      ctx.fillStyle = '#5e3b1c'; rrect(ctx, px + 6, py + 26, w - 12, 9, 2); ctx.fill();
      ctx.fillStyle = '#6b4423'; rrect(ctx, px + 8, py + 6, 24, 16, 3); ctx.fill();
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3b2410'; ctx.fillRect(px + 8, py + 12, 24, 2);
      const saved = isl && isl.bank ? isl.bank.saved : 0, coins = Math.min(6, Math.ceil(saved / 500));
      ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#a07a10'; ctx.lineWidth = 1;
      for (let i = 0; i < coins; i++) { ctx.beginPath(); ctx.arc(px + 12 + (i % 3) * 7, py + 9 - Math.floor(i / 3) * 3, 3, 0, TAU); ctx.fill(); ctx.stroke(); }
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px + w - 18 + i * 3, py + 30, 2.5, 0, TAU); ctx.fill(); ctx.stroke(); }
      drawPerson(ctx, px + w - 16, py + 14, Math.PI / 2, '#1f2a36', isl ? Math.sin(t * 2) : 0, '#111');
      drawPerson(ctx, cx, py + h - 12, -Math.PI / 2, '#7b3f2a', 0, '#7a1f1f');
    } else if (b.type === 'cartografo') {
      // Casa del cartógrafo: mesa con un mapa abierto, globo terráqueo, rollos y el cartógrafo con su pluma.
      floor(ctx, px, py, w, h, '#a8865a', '#5e3b1c');
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + i * 10.5); ctx.lineTo(px + w - 4, py + i * 10.5); ctx.stroke(); }
      ctx.fillStyle = '#6b4423'; rrect(ctx, px + 8, py + 10, w - 16, 26, 3); ctx.fill();
      ctx.fillStyle = '#f0dfb4'; rrect(ctx, px + 12, py + 13, w - 24, 20, 2); ctx.fill();
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 16, py + 28); ctx.quadraticCurveTo(cx - 4, py + 14, cx + 4, py + 24); ctx.quadraticCurveTo(cx + 12, py + 30, px + w - 16, py + 18); ctx.stroke();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx + 6, py + 19); ctx.lineTo(cx + 10, py + 23); ctx.moveTo(cx + 10, py + 19); ctx.lineTo(cx + 6, py + 23); ctx.stroke();
      ctx.fillStyle = '#3e7cb1'; ctx.beginPath(); ctx.arc(px + w - 11, py + h - 12, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6fae5a'; ctx.beginPath(); ctx.arc(px + w - 13, py + h - 13, 2.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px + w - 11, py + h - 12, 7, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#e8d6a8'; ctx.strokeStyle = '#8a6a3a';
      for (let i = 0; i < 2; i++) { rrect(ctx, px + 6, py + h - 16 + i * 5, 14, 4, 2); ctx.fill(); ctx.stroke(); }
      drawPerson(ctx, cx, py + h - 16, -Math.PI / 2, '#2c3e50', b.on ? t * 6 : 0, '#1a1a1a');
      if (b.on) { ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx + 4, py + h - 21); ctx.lineTo(cx + 9 + Math.sin(t * 12) * 2, py + h - 30); ctx.stroke(); }
      const k = b.inv && Object.keys(b.inv).find(k => b.inv[k] > 0);
      if (k) drawBundle(ctx, px + 12, py + 38, k, 3.5);
    } else if (b.type === 'clasificador') {
      // Capataz con su cartel: lo elegido sigue derecho, lo demás a los costados.
      drawBelt(ctx, b);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.dir * Math.PI / 2);
      ctx.fillStyle = 'rgba(200,200,200,0.85)';
      for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-2, sy * 15); ctx.lineTo(3, sy * 10); ctx.lineTo(-7, sy * 10); ctx.fill(); }
      ctx.restore();
      drawPerson(ctx, cx - 3, cy, b.dir * Math.PI / 2, '#8e1b1b', 0, '#1a1a1a');
      ctx.fillStyle = '#6d4c2a'; ctx.fillRect(px + T - 9, py + 3, 2, 10);
      ctx.fillStyle = b.filter ? D.RES[b.filter].c : '#f4ecd8'; ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1;
      ctx.fillRect(px + T - 13, py + 2, 10, 7); ctx.strokeRect(px + T - 13, py + 2, 10, 7);
      if (b.hold) drawBundle(ctx, cx + 6, cy + 6, b.hold, 3.5);
    } else if (b.type === 'repartidor') {
      // Repartidor: un hombre en el cruce que señala a un lado y al otro, con flechas amarillas a los costados.
      drawBelt(ctx, b);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.dir * Math.PI / 2);
      ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.2;
      for (const sy of [-1, 1]) {
        const on = (b.side || 0) === (sy < 0 ? 0 : 1); // el lado que le toca ahora, más marcado
        ctx.globalAlpha = on ? 1 : 0.55;
        ctx.beginPath(); ctx.moveTo(0, sy * 17); ctx.lineTo(-6, sy * 10); ctx.lineTo(6, sy * 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      const look = b.dir * Math.PI / 2 + ((b.side || 0) ? Math.PI / 2 : -Math.PI / 2);
      drawPerson(ctx, cx - 2, cy, look, '#6c3483', b.hold ? t * 8 : 0, '#1a1a1a');
      if (b.hold) drawBundle(ctx, cx + 6, cy + 6, b.hold, 3.5);
    } else if (b.type === 'insertador') {
      // Estibador: camina de atrás hacia adelante llevando una cosa por vez.
      ctx.fillStyle = '#a07a4a'; ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 1, cy); ctx.lineTo(px + T - 1, cy); ctx.stroke();
      const [dx, dy] = DIRS[b.dir], f = b.hand ? (b.prog || 0) - 0.5 : -0.3;
      const x = cx + dx * f * T * 0.6, y = cy + dy * f * T * 0.6;
      drawPerson(ctx, x, y, b.dir * Math.PI / 2, '#2f4f6f', b.hand ? t * 9 : 0, '#7a1f1f');
      if (b.hand) drawBundle(ctx, x, y, b.hand, 4);
      if (b.filter === Isl.INS_NONE) {
        // Parado: una cruz roja en la esquina.
        ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + 10, py + 10); ctx.moveTo(px + 10, py + 3); ctx.lineTo(px + 3, py + 10); ctx.stroke();
      } else if (b.filter === Isl.INS_TECH) {
        // Lleva lo de la investigación: un rollito de mapa celeste.
        ctx.fillStyle = '#5dade2'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px + 6, py + 6, 3.5, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(px + 4.5, py + 5.3, 3, 1.4);
      } else if (b.filter) { ctx.fillStyle = D.RES[b.filter].c; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(px + 6, py + 6, 3.5, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
    if (!NO_ARROW.includes(D.base(b.type))) drawArrow(ctx, b);
    if (b.broken) drawBroken(ctx, b, t);
  }

  function drawBroken(ctx, b, t) {
    const def = D.BUILD[b.type], px = b.x * T, py = b.y * T, w = def.w * T, h = def.h * T;
    ctx.fillStyle = 'rgba(30,20,15,0.55)'; ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + w * 0.2, py + h * 0.3); ctx.lineTo(px + w * 0.45, py + h * 0.55); ctx.lineTo(px + w * 0.35, py + h * 0.8); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + i / 3) % 1, fx = px + w * (0.3 + i * 0.2);
      ctx.fillStyle = `rgba(255,${120 + i * 30},30,${0.8 - ph * 0.6})`;
      ctx.beginPath(); ctx.arc(fx, py + h * 0.6 - ph * 8, 4 + (1 - ph) * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(60,60,60,${0.45 - ph * 0.4})`;
      ctx.beginPath(); ctx.arc(fx + ph * 6, py + h * 0.4 - ph * 26, 4 + ph * 8, 0, TAU); ctx.fill();
    }
  }

  // Edificio evolucionado: el mismo dibujo que su base, más grande, con borde dorado y un estandarte.
  function drawEvolved(ctx, b, isl, t, def) {
    const base = D.BUILD[def.of], s = def.w / base.w, px = b.x * T, py = b.y * T, w = def.w * T, h = def.h * T;
    ctx.save();
    ctx.translate(px, py); ctx.scale(s, s); ctx.translate(-px, -py);
    drawMachine(ctx, Object.assign({}, b, { type: def.of }), isl, t);
    ctx.restore();
    ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 3;
    rrect(ctx, px + 2, py + 2, w - 4, h - 4, 7); ctx.stroke();
    ctx.fillStyle = '#5e3b1c'; ctx.fillRect(px + 7, py + 5, 2.5, 22);
    ctx.fillStyle = '#8e1b1b';
    ctx.beginPath(); ctx.moveTo(px + 9.5, py + 6); ctx.lineTo(px + 25, py + 6); ctx.lineTo(px + 21, py + 12); ctx.lineTo(px + 25, py + 18); ctx.lineTo(px + 9.5, py + 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f5d76e'; ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', px + 16, py + 12.5);
    ctx.textBaseline = 'alphabetic';
  }

  function drawTiles(ctx, isl, x0, y0, x1, y1, t) {
    const g = isl.grid;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const l = g.land[y * g.w + x];
        const h = U.hash(x + isl.id * 101, y);
        if (!l) {
          if (landAt(isl, x - 1, y) || landAt(isl, x + 1, y) || landAt(isl, x, y - 1) || landAt(isl, x, y + 1)) {
            ctx.fillStyle = 'rgba(140,220,225,0.35)'; ctx.fillRect(x * T, y * T, T, T);
          } else if (h > 0.85) {
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
            const wx = x * T + 16 + Math.sin(t + h * 20) * 4, wy = y * T + 16;
            ctx.beginPath(); ctx.moveTo(wx - 7, wy); ctx.quadraticCurveTo(wx, wy - 5, wx + 7, wy); ctx.stroke();
          }
          continue;
        }
        ctx.fillStyle = l === 1 ? (h > 0.5 ? '#e6d29c' : '#e0cb92') : (h > 0.5 ? '#5ca24c' : '#56994a');
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
    // Yacimientos
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = y * g.w + x, k = g.res[idx];
        if (!k) continue;
        const a = g.amt[idx], px = x * T, py = y * T;
        if (k === 'madera') {
          const s = 0.55 + Math.min(1, a / 200) * 0.45;
          const ox = (U.hash(x, y + 3) - 0.5) * 8, oy = (U.hash(x + 3, y) - 0.5) * 8;
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(px + 18 + ox, py + 19 + oy, 12 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2e6b2a'; ctx.beginPath(); ctx.arc(px + 16 + ox, py + 16 + oy, 12 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3f8a36'; ctx.beginPath(); ctx.arc(px + 13 + ox, py + 13 + oy, 6 * s, 0, TAU); ctx.fill();
        } else if (k === 'cana') {
          for (let i = 0; i < 4; i++) {
            const sx = px + 5 + U.hash(x * 3 + i, y * 7) * 22, sy = py + 26 - U.hash(x + i, y * 5) * 4;
            ctx.strokeStyle = '#4f7f25'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 1, sy - 18); ctx.stroke();
            ctx.fillStyle = '#a9cc5b'; ctx.beginPath(); ctx.ellipse(sx + 2, sy - 18, 4, 1.6, -0.6, 0, TAU); ctx.fill();
          }
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, py, T, T);
          const n = a > 180 ? 4 : a > 80 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const rx = px + 6 + U.hash(x * 7 + i, y * 3) * 20, ry = py + 6 + U.hash(x * 5, y * 11 + i) * 20;
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(rx + 1, ry + 1.5, 5, 0, TAU); ctx.fill();
            ctx.fillStyle = D.RES[k].c; ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, TAU); ctx.fill();
          }
        }
      }
    }
  }

  // Miniatura de un edificio (para la barra de construcción), con el mismo dibujo que en el juego.
  Isl.thumb = function (type) {
    const def = D.BUILD[type], size = 64, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const s = size / (Math.max(def.w, def.h) * T + 8);
    ctx.scale(s, s);
    ctx.translate(4, 4);
    const b = { type, x: 0, y: 0, dir: 0, id: 0.6, items: [] };
    if (type === 'cinta') {
      drawBelt(ctx, b);
      drawPorter(ctx, T * 0.5, T * 0.5, 0, 'cobre', 0.3);
    } else drawMachine(ctx, b, null, 0);
    return cv.toDataURL();
  };

  Isl.render = function (ctx) {
    const isl = Isl.cur, c = Isl.cam, t = PV.time, g = isl.grid;
    ctx.fillStyle = '#1d5f8a'; ctx.fillRect(0, 0, PV.W, PV.H);
    ctx.save();
    ctx.translate(PV.W / 2, PV.H / 2); ctx.scale(c.z, c.z); ctx.translate(-c.x, -c.y);

    const [wx0, wy0] = screenToWorld(0, 0), [wx1, wy1] = screenToWorld(PV.W, PV.H);
    const x0 = Math.max(0, Math.floor(wx0 / T)), y0 = Math.max(0, Math.floor(wy0 / T));
    const x1 = Math.min(g.w - 1, Math.floor(wx1 / T)), y1 = Math.min(g.h - 1, Math.floor(wy1 / T));
    drawTiles(ctx, isl, x0, y0, x1, y1, t);

    if (Isl.sel) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * T, y0 * T); ctx.lineTo(x * T, (y1 + 1) * T); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * T, y * T); ctx.lineTo((x1 + 1) * T, y * T); }
      ctx.stroke();
    }

    for (const b of isl.buildings) if (b.type === 'cinta') drawBelt(ctx, b);
    for (const b of isl.buildings) {
      if (b.type !== 'cinta') continue;
      const [dx, dy] = DIRS[b.dir];
      for (const it of b.items) drawPorter(ctx, b.x * T + T / 2 + dx * (it.p - 0.5) * T, b.y * T + T / 2 + dy * (it.p - 0.5) * T, b.dir, it.t, t);
    }
    Isl._night = PV.Colony.isNight();
    for (const b of isl.buildings) if (b.type !== 'cinta') drawMachine(ctx, b, isl, t);
    for (const b of isl.buildings) if (D.base(b.type) === 'muelle') drawDockSign(ctx, b);
    Isl._night = false;
    drawCommute(ctx, isl, t);
    for (const b of isl.buildings) if (b._warn) drawWarn(ctx, b, t);

    // Fantasma del edificio a colocar
    if (Isl.sel && Isl.hover) {
      const def = D.BUILD[Isl.sel];
      const [x, y] = ghostPos(Isl.sel, Isl.hover[0], Isl.hover[1]);
      const ok = Isl.canPlace(isl, Isl.sel, x, y) && PV.Inv.canPay(def.cost, isl);
      const ghost = { type: Isl.sel, x, y, dir: Isl.dir, id: 0, items: [] };
      ctx.globalAlpha = 0.6;
      if (Isl.sel === 'cinta') drawBelt(ctx, ghost); else drawMachine(ctx, ghost, null, t);
      if (Isl.sel === 'cinta') drawArrow(ctx, ghost);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? '#58d26b' : '#e74c3c'; ctx.lineWidth = 2;
      ctx.strokeRect(x * T + 1, y * T + 1, def.w * T - 2, def.h * T - 2);
    } else if (Isl.hover && inside(isl, Isl.hover[0], Isl.hover[1])) {
      const b = occAt(isl, Isl.hover[0], Isl.hover[1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      if (b) { const def = D.BUILD[b.type]; ctx.strokeRect(b.x * T, b.y * T, def.w * T, def.h * T); }
      else ctx.strokeRect(Isl.hover[0] * T, Isl.hover[1] * T, T, T);
    }
    ctx.restore();
    // Noche: faroles en las tabernas y en los edificios.
    const toScr = (wx, wy) => [(wx - c.x) * c.z + PV.W / 2, (wy - c.y) * c.z + PV.H / 2];
    const lights = [];
    for (const b of isl.buildings) {
      if (b.type === 'cinta' || b.type === 'empalizada') continue;
      const def = D.BUILD[b.type], [sx, sy] = toScr((b.x + def.w / 2) * T, (b.y + def.h / 2) * T);
      lights.push([sx, sy, (b.type === 'taberna' ? 170 : 26 + def.w * 14) * c.z]);
    }
    PV.Colony.drawNight(ctx, lights);
  };

  // Al anochecer la gente camina de su trabajo a la taberna más cercana; al amanecer, vuelve.
  const WALK = 14;
  function drawCommute(ctx, isl, t) {
    const C = D.COLONY, ph = PV.Colony.phase(), n0 = C.day - C.night;
    let f;
    if (ph >= n0 && ph < n0 + WALK) f = (ph - n0) / WALK;              // yendo
    else if (ph >= C.day - WALK) f = 1 - (ph - (C.day - WALK)) / WALK;   // volviendo
    else return;
    const tavs = PV.Colony.taverns(isl);
    if (!tavs.length) return;
    const ctr = b => { const d = D.BUILD[b.type]; return [(b.x + d.w / 2) * T, (b.y + d.h / 2) * T]; };
    let k = 0;
    for (const b of isl.buildings) {
      if (!PV.Colony.isWorker(b) || b.broken) continue;
      const [bx, by] = ctr(b);
      const tv = tavs.reduce((m, o) => { const [ox, oy] = ctr(o); const d = (ox - bx) ** 2 + (oy - by) ** 2; return d < m[0] ? [d, ox, oy] : m; }, [Infinity, 0, 0]);
      for (let i = 0; i < Math.min(2, PV.Colony.crewOf(b)); i++, k++) {
        const ff = U.clamp(f * 1.25 - i * 0.12 - (k % 5) * 0.03, 0, 1);
        const x = bx + (tv[1] - bx) * ff + (i ? 6 : -6), y = by + (tv[2] - by) * ff;
        drawPerson(ctx, x, y, Math.atan2(tv[2] - by, tv[1] - bx) + (ph >= n0 + WALK ? Math.PI : 0), ['#7b3f2a', '#3d5a80', '#556b2f'][k % 3], t * 9 + k, '#5a3a1e');
      }
    }
  }

  PV.Island = Isl;
})(window.PV);
