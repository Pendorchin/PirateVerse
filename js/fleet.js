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

  Fleet.buy = function (port) {
    const S = PV.state, L = Fleet.list(), M = D.MERCHANT;
    if (L.length >= M.max) return PV.UI.toast(`Ya tenés ${M.max} mercantes, es el máximo.`, 'bad');
    if (!PV.Inv.canPay(M.cost, null)) return PV.UI.toast('Te faltan doblones o tablones en la bodega.', 'bad');
    PV.Inv.pay(M.cost, null);
    // Arranca sirviendo a la isla con muelle más cercana a este puerto.
    const withDock = owned().filter(i => PV.Island.docks(i).length);
    const home = (withDock.length ? withDock : owned()).sort((a, b) => U.dist(a.x, a.y, port.x, port.y) - U.dist(b.x, b.y, port.x, port.y))[0];
    L.push({
      id: S.nextId++, name: NAMES[L.length % NAMES.length], home: home.id, port: port.id,
      x: port.x + port.R + 120, y: port.y, a: 0, v: 0, st: 'toHome', cargo: {}, wait: 0, earned: 0,
    });
    PV.UI.toast(`¡Compraste ${L[L.length - 1].name}! Va a buscar carga a ${home.name}.`, 'good');
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
    if (m.st === 'load') return PV.Island.docks(H).length ? `Cargando en el muelle (${n}/${D.MERCHANT.cap})` : `Esperando: ${H.name} no tiene muelle`;
    return `Rumbo a ${P.name} con ${n} de carga`;
  };

  function sail(m, target, dt) {
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
    m.v = U.lerp(m.v, D.MERCHANT.speed, Math.min(1, dt));
    m.x += Math.cos(m.a) * m.v * dt;
    m.y += Math.sin(m.a) * m.v * dt;
    PV.Sea.collide(m, 20);
    return coastDist(m, target) < 70;
  }

  Fleet.update = function (dt) {
    for (const m of Fleet.list()) {
      const H = islandOf(m.home), P = islandOf(m.port);
      if (m.st === 'toHome') {
        if (sail(m, H, dt)) { m.st = 'load'; m.wait = 0; }
      } else if (m.st === 'load') {
        m.v = U.lerp(m.v, 0, Math.min(1, dt * 2));
        m.wait += dt;
        PV.Island.takeFromDocks(H, m.cargo, D.MERCHANT.cap - PV.Inv.sum(m.cargo));
        const n = PV.Inv.sum(m.cargo);
        if (n >= D.MERCHANT.cap || (n > 0 && m.wait > 25)) m.st = 'toPort';
      } else if (m.st === 'toPort') {
        if (sail(m, P, dt)) {
          const got = PV.Port.sellAll(P, m.cargo);
          m.earned += got;
          PV.state.doblones += got;
          if (got) PV.UI.toast(`⛵ ${m.name} vendió su carga en ${P.name} por ${got} doblones.`, 'good');
          m.st = 'toHome';
        }
      }
    }
  };

  PV.Fleet = Fleet;
})(window.PV);
