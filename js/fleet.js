// Flota mercante: barcos comprados que cargan en el muelle de una isla tuya y venden solos en un puerto.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D, Wd = PV.World;
  const Fleet = {};
  const NAMES = ['La Gaviota', 'El Albatros', 'La Tortuga', 'El Pelícano', 'La Golondrina', 'El Cormorán'];
  const islandOf = id => PV.state.islands[id];
  const coastDist = (o, I) => U.dist(o.x, o.y, I.x, I.y) - Wd.radius(I, Math.atan2(o.y - I.y, o.x - I.x));
  const owned = () => PV.state.islands.filter(i => i.owned);
  const ports = () => PV.state.islands.filter(i => i.port);

  Fleet.list = () => PV.state.fleet || (PV.state.fleet = []);
  // ---------- Niveles de barco y planos ----------
  // m.ml: nivel del barco (1, 2 o 3). Los planos del II y el III se compran en los puertos.
  const LV = D.SHIP_LV, ROMAN = ['', 'I', 'II', 'III'];
  Fleet.roman = lv => ROMAN[lv || 1];
  Fleet.plans = () => PV.state.plans || (PV.state.plans = {});
  Fleet.knows = (kind, lv) => lv <= 1 || !!Fleet.plans()[kind + lv];
  Fleet.bestKnown = kind => (Fleet.knows(kind, 3) ? 3 : Fleet.knows(kind, 2) ? 2 : 1);
  Fleet.buyPlan = function (id) {
    const P = D.PLANS[id], S = PV.state;
    if (!P || Fleet.plans()[id]) return;
    if (P.req && !Fleet.plans()[P.req]) return PV.UI.toast('Primero comprá el plano del nivel anterior.', 'bad');
    if (S.doblones < P.p) return PV.UI.toast('No te alcanzan los doblones.', 'bad');
    S.doblones -= P.p;
    Fleet.plans()[id] = true;
    PV.UI.toast(`📜 ¡Compraste el plano de ${D.SHIP_NAMES[P.kind].toLowerCase()} nivel ${ROMAN[P.lv]}! Construilo o mejorá tus barcos en un Astillero de tu isla.`, 'good');
  };

  // Mercantes: cada uno extra cuesta más (MERCHANT_MORE); lo demás depende del nivel.
  Fleet.costFor = (n, lv) => {
    const c = Object.assign({}, LV.mercante[lv || 1].cost), k = D.MERCHANT_MORE[Math.min(n, D.MERCHANT_MORE.length - 1)];
    c.doblones = Math.round(c.doblones * k / 50) * 50;
    c.tablones += 10 * n;
    return c;
  };
  Fleet.nextCost = lv => Fleet.costFor(Fleet.list().length, lv);
  Fleet.cap = m => LV.mercante[(m && m.ml) || 1].cap + PV.Tech.fx('mCap');
  Fleet.speedOf = m => D.MERCHANT.speed * LV.mercante[(m && m.ml) || 1].spd;

  function newMerchant(home, port, lv, x, y) {
    const S = PV.state, L = Fleet.list();
    const m = { id: S.nextId++, name: NAMES[L.length % NAMES.length], home: home.id, port: port.id, ml: lv || 1,
      x, y, a: 0, v: 0, st: 'toHome', cargo: {}, wait: 0, earned: 0 };
    L.push(m);
    return m;
  }

  // En el puerto se compran mercantes de nivel I, pagando con la bodega.
  Fleet.buy = function (port) {
    const L = Fleet.list(), M = D.MERCHANT;
    if (L.length >= M.max) return PV.UI.toast(`Ya tenés ${M.max} mercantes, es el máximo.`, 'bad');
    const cost = Fleet.nextCost(1);
    if (!PV.Inv.canPay(cost, null)) return PV.UI.toast('Te faltan doblones o tablones en la bodega.', 'bad');
    PV.Inv.pay(cost, null);
    // Arranca sirviendo a la isla con muelle más cercana a este puerto.
    const withDock = owned().filter(i => PV.Island.docks(i).length);
    const home = (withDock.length ? withDock : owned()).sort((a, b) => U.dist(a.x, a.y, port.x, port.y) - U.dist(b.x, b.y, port.x, port.y))[0];
    const m = newMerchant(home, port, 1, port.x + port.R + 120, port.y);
    PV.UI.toast(`¡Compraste ${m.name}! Va a buscar carga a ${home.name}.`, 'good');
  };

  // En el astillero de tu isla: mercantes de cualquier nivel que conozcas, pagando con el almacén de la isla.
  Fleet.buildMerchant = function (isl, lv) {
    const L = Fleet.list(), M = D.MERCHANT;
    if (!Fleet.knows('mercante', lv)) return PV.UI.toast('Te falta el plano: se compra en los puertos.', 'bad');
    if (L.length >= M.max) return PV.UI.toast(`Ya tenés ${M.max} mercantes, es el máximo.`, 'bad');
    const cost = Fleet.nextCost(lv);
    if (!PV.Inv.canPay(cost, isl)) return PV.UI.toast('Te falta: ' + PV.Island.costTxt(cost), 'bad');
    PV.Inv.pay(cost, isl);
    const port = ports().sort((a, b) => U.dist(a.x, a.y, isl.x, isl.y) - U.dist(b.x, b.y, isl.x, isl.y))[0];
    const m = newMerchant(isl, port, lv, isl.x + isl.R + 120, isl.y);
    PV.UI.toast(`⛵ ¡Los carpinteros terminaron ${m.name} (mercante ${ROMAN[lv]})! Vende en ${port.name}.`, 'good');
  };

  // Mejorar un barco al nivel siguiente: cuesta lo mismo que uno nuevo de ese nivel (sin el recargo por cantidad).
  Fleet.upgradeCost = (kind, b) => LV[kind][(b.ml || 1) + 1] && LV[kind][(b.ml || 1) + 1].cost;
  Fleet.upgrade = function (isl, kind, b) {
    const lv = (b.ml || 1) + 1, cost = Fleet.upgradeCost(kind, b);
    if (!cost) return;
    if (!Fleet.knows(kind, lv)) return PV.UI.toast('Te falta el plano: se compra en los puertos.', 'bad');
    if (!PV.Inv.canPay(cost, isl)) return PV.UI.toast('Te falta: ' + PV.Island.costTxt(cost), 'bad');
    PV.Inv.pay(cost, isl);
    b.ml = lv;
    PV.UI.toast(`🛠️ ${b.name} ahora es ${D.SHIP_NAMES[kind].toLowerCase()} nivel ${ROMAN[lv]}.`, 'good');
  };

  // Cambia la isla o el puerto de la ruta al siguiente disponible.
  Fleet.cycle = function (i, field) {
    const m = Fleet.list()[i];
    if (!m) return;
    const opts = field === 'home' ? owned() : ports();
    const k = opts.findIndex(o => o.id === m[field]);
    m[field] = opts[(k + 1) % opts.length].id;
    if (field === 'home' && m.st === 'load') m.st = 'toHome';
  };

  Fleet.status = function (m) {
    const H = islandOf(m.home), P = islandOf(m.port), n = PV.Inv.sum(m.cargo);
    if (m.st === 'toHome') return `Volviendo a ${H.name}`;
    if (m.st === 'load') return PV.Island.sellDocks(H).length ? `Cargando en el muelle (${n}/${Fleet.cap(m)})` : PV.Island.docks(H).length ? `Esperando: los muelles de ${H.name} no venden (o son de descarga)` : `Esperando: ${H.name} no tiene muelle`;
    return `Rumbo a ${P.name} con ${n} de carga`;
  };

  // Antes de zarpar, la tripulación del mercante carga raciones y ron de la isla.
  function provision(m, H) {
    const need = D.COLONY.merchant;
    m.owe = {};
    for (const k in need) {
      const got = Math.min(need[k], H.storage[k] || 0);
      PV.Inv.add(H.storage, k, -got);
      if (got < need[k]) m.owe[k] = need[k] - got;
    }
  }

  function sail(m, target, dt, speed) {
    let want = Math.atan2(target.y - m.y, target.x - m.x);
    // Esquiva las islas que tiene adelante.
    for (const I of PV.state.islands) {
      if (I === target) continue;
      const d = U.dist(m.x, m.y, I.x, I.y);
      if (d > I.R * 1.5 + 160) continue;
      const toI = Math.atan2(I.y - m.y, I.x - m.x), diff = U.angDiff(want, toI);
      if (Math.abs(diff) < 1.3) want += Math.sign(diff || 1) * (1.3 - Math.abs(diff)) * 1.3;
    }
    m.a += U.clamp(U.angDiff(want, m.a), -1.6 * dt, 1.6 * dt);
    m.v = U.lerp(m.v, (speed || D.MERCHANT.speed) * PV.Tech.fx('mSpeed'), Math.min(1, dt));
    m.x += Math.cos(m.a) * m.v * dt;
    m.y += Math.sin(m.a) * m.v * dt;
    PV.Sea.collide(m, 20);
    return coastDist(m, target) < 70;
  }

  Fleet.update = function (dt) {
    for (const m of Fleet.list()) {
      const H = islandOf(m.home), P = islandOf(m.port);
      if (m.st === 'toHome') {
        if (sail(m, H, dt, Fleet.speedOf(m))) {
          // Lo que el puerto no quiso comprar vuelve al almacén de la isla.
          for (const k of Object.keys(m.cargo)) { PV.Inv.add(H.storage, k, m.cargo[k]); delete m.cargo[k]; }
          m.st = 'load'; m.wait = 0;
        }
      } else if (m.st === 'load') {
        m.v = U.lerp(m.v, 0, Math.min(1, dt * 2));
        m.wait += dt;
        PV.Island.takeFromDocks(H, m.cargo, Fleet.cap(m) - PV.Inv.sum(m.cargo), true);
        const n = PV.Inv.sum(m.cargo);
        if (n >= Fleet.cap(m) || (n > 0 && m.wait > 25)) { provision(m, H); m.st = 'toPort'; }
      } else if (m.st === 'toPort') {
        if (sail(m, P, dt, Fleet.speedOf(m))) {
          let got = PV.Port.sellAll(P, m.cargo);
          const left = Object.keys(m.cargo);
          if (left.length) PV.UI.toast(`⛵ En ${P.name} no compran ${PV.Port.names(left)}: ${m.name} lo trae de vuelta. Probá con otro puerto.`, 'bad');
          // Lo que no consiguió de provisiones en la isla lo compra en el puerto.
          let paid = 0;
          for (const k in m.owe || {}) paid += m.owe[k] * PV.Port.buyPrice(P, k);
          m.owe = null;
          if (paid) { got = Math.max(0, got - paid); PV.UI.toast(`⛵ ${m.name} compró raciones y ron en ${P.name} (${paid} doblones): tu isla no tenía.`, 'bad'); }
          m.earned += got;
          PV.state.doblones += got;
          if (got) PV.UI.toast(`⛵ ${m.name} vendió su carga en ${P.name} por ${got} doblones.`, 'good');
          m.st = 'toHome';
        }
      }
    }
  };

  // ---------- Balandras de cabotaje (entre tus islas) ----------
  const CB = D.COASTER;
  const CB_NAMES = ['La Sardina', 'El Delfín', 'La Garza', 'El Pejerrey', 'La Mojarra', 'El Bagre', 'La Corvina', 'El Lenguado'];
  Fleet.coast = () => PV.state.coast || (PV.state.coast = []);
  Fleet.coastOf = isl => Fleet.coast().filter(c => c.home === isl.id);
  Fleet.coastMax = isl => PV.Island.docks(isl).length * CB.perDock;
  const load = c => PV.Inv.sum(c.in) + PV.Inv.sum(c.out);
  Fleet.coastCap = c => LV.balandra[c.ml || 1].cap;
  const ccap = Fleet.coastCap;
  // Ruta: su isla y después las paradas que siguen siendo tuyas.
  const route = c => [c.home].concat(c.stops.filter(s => islandOf(s.isl).owned).map(s => s.isl));
  const stopOf = (c, id) => c.stops.find(s => s.isl === id);

  Fleet.buyCoaster = function (isl, lv) {
    lv = lv || 1;
    const cost = LV.balandra[lv].cost;
    if (!Fleet.knows('balandra', lv)) return PV.UI.toast('Te falta el plano: se compra en los puertos.', 'bad');
    const S = PV.state, mine = Fleet.coastOf(isl);
    if (!PV.Island.docks(isl).length) return PV.UI.toast('Primero construí un muelle en esta isla.', 'bad');
    if (mine.length >= Fleet.coastMax(isl)) return PV.UI.toast(`Cada muelle tiene lugar para ${CB.perDock} balandras. Construí otro muelle para tener más.`, 'bad');
    if (!PV.Inv.canPay(cost, isl)) return PV.UI.toast('Te falta: ' + PV.Island.costTxt(cost), 'bad');
    PV.Inv.pay(cost, isl);
    const others = owned().filter(o => o.id !== isl.id);
    const c = {
      id: S.nextId++, name: CB_NAMES[Fleet.coast().length % CB_NAMES.length], home: isl.id,
      stops: others.length ? [{ isl: others[0].id, mode: 'traer' }] : [],
      ml: lv, x: isl.x + isl.R + 100, y: isl.y + 40, a: 0, v: 0, leg: 0, st: 'sail', wait: 0, in: {}, out: {},
    };
    Fleet.coast().push(c);
    PV.UI.toast(`⛵ ¡Compraste la balandra ${c.name}! Elegí sus paradas en el muelle.`, 'good');
    return c;
  };

  // Cambios de ruta desde el panel del muelle.
  Fleet.coastEdit = function (c, what, s) {
    const others = owned().filter(o => o.id !== c.home);
    if (what === 'add') {
      if (c.stops.length >= CB.stops) return;
      const free = others.find(o => !stopOf(c, o.id));
      if (!free) return PV.UI.toast(others.length ? 'Ya pasa por todas tus otras islas: conquistá otra para sumar una parada.' : 'Necesitás otra isla tuya para armar una ruta.', 'bad');
      c.stops.push({ isl: free.id, mode: 'traer' });
    } else if (what === 'isl') {
      const st = c.stops[s];
      if (!st || !others.length) return;
      // La siguiente isla que no esté ya en la otra parada.
      const i = others.findIndex(o => o.id === st.isl);
      for (let k = 1; k <= others.length; k++) {
        const o = others[(i + k) % others.length];
        if (o.id === st.isl || !c.stops.some(x => x !== st && x.isl === o.id)) { st.isl = o.id; break; }
      }
    } else if (what === 'mode') {
      const st = c.stops[s];
      if (st) st.mode = st.mode === 'traer' ? 'llevar' : 'traer';
    } else if (what === 'del') {
      c.stops.splice(s, 1);
    } else if (what === 'sell') {
      // Se vende por la mitad; lo que lleva a bordo vuelve al almacén de su isla.
      const H = islandOf(c.home);
      for (const bag of [c.in, c.out]) for (const k in bag) PV.Inv.add(H.storage, k, bag[k]);
      PV.state.doblones += Math.round(LV.balandra[c.ml || 1].cost.doblones / 2);
      PV.state.coast = Fleet.coast().filter(o => o !== c);
      PV.UI.toast(`Vendiste la balandra ${c.name} por ${Math.round(LV.balandra[c.ml || 1].cost.doblones / 2)} doblones.`);
    }
    c.leg = 0; c.st = 'sail'; // vuelve a empezar la vuelta desde su isla
  };

  Fleet.coastStatus = function (c) {
    const r = route(c);
    if (r.length < 2) return 'Sin paradas: agregale una isla.';
    const at = islandOf(r[c.leg % r.length]), n = load(c);
    if (c.st === 'stop') return `En ${at.name} (${n}/${ccap(c)})`;
    return `Rumbo a ${at.name} con ${n}/${ccap(c)}${c.hungry ? ' · sin provisiones, va lento' : ''}`;
  };

  // Lo que hace al llegar a cada isla.
  function coastArrive(c, I) {
    const room = () => ccap(c) - load(c);
    if (I.id === c.home) {
      for (const k of Object.keys(c.in)) { PV.Island.dropAtIsland(I, c.in, k, c.in[k]); }
      if (c.stops.some(s => s.mode === 'llevar' && islandOf(s.isl).owned)) PV.Island.takeFromDocks(I, c.out, room());
      // Provisiones de la tripulación, del almacén de su isla.
      const need = D.COLONY.merchant;
      c.hungry = false;
      for (const k in need) {
        const got = Math.min(need[k], I.storage[k] || 0);
        PV.Inv.add(I.storage, k, -got);
        if (got < need[k]) c.hungry = true;
      }
      return;
    }
    const st = stopOf(c, I.id);
    if (!st) return;
    if (st.mode === 'traer') { PV.Island.takeFromDocks(I, c.in, room()); return; }
    // Llevar: reparte lo que lleva entre las paradas de "llevar" que quedan en esta vuelta.
    const r = route(c), left = r.slice(c.leg % r.length).filter(id => { const s = stopOf(c, id); return s && s.mode === 'llevar'; }).length || 1;
    for (const k of Object.keys(c.out)) {
      const n = Math.ceil(c.out[k] / left);
      PV.Island.dropAtIsland(I, c.out, k, n);
    }
  }

  Fleet.updateCoast = function (dt) {
    for (const c of Fleet.coast()) {
      const r = route(c);
      if (r.length < 2) { c.leg = 0; c.st = 'stop'; c.v = U.lerp(c.v, 0, Math.min(1, dt * 2)); continue; }
      const I = islandOf(r[c.leg % r.length]);
      if (c.st === 'sail') {
        if (sail(c, I, dt, CB.speed * LV.balandra[c.ml || 1].spd * (c.hungry ? 0.7 : 1))) { c.st = 'stop'; c.wait = 0; coastArrive(c, I); }
      } else {
        c.v = U.lerp(c.v, 0, Math.min(1, dt * 2));
        c.wait += dt;
        if (c.wait >= CB.wait) { c.leg = (c.leg + 1) % r.length; c.st = 'sail'; }
      }
    }
  };

  PV.Fleet = Fleet;
})(window.PV);
