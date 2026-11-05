// Investigación: el Cartógrafo estudia materiales y desbloquea mejoras.
// Estado guardado en PV.state.research = { cur, prog: { tech: { recurso: n } }, done: { tech: true } }.
(function (PV) {
  'use strict';
  const D = PV.D;
  const Tech = {};
  let fxCache = null;

  Tech.st = function () {
    const S = PV.state;
    if (!S) return null;
    if (!S.research) S.research = { cur: null, prog: {}, done: {} };
    return S.research;
  };

  Tech.done = id => { const r = Tech.st(); return !!(r && r.done[id]); };
  Tech.reqOk = id => (D.TECH[id].req || []).every(Tech.done);
  Tech.available = id => !Tech.done(id) && Tech.reqOk(id);

  // Efecto acumulado de todo lo investigado. Los de D.TECH_ADD se suman (base 0), el resto multiplica (base 1).
  Tech.fx = function (key) {
    if (!fxCache) {
      fxCache = {};
      const r = Tech.st();
      if (r) for (const id in r.done) {
        const fx = D.TECH[id] && D.TECH[id].fx;
        if (fx) for (const k in fx) {
          if (D.TECH_ADD.includes(k)) fxCache[k] = (fxCache[k] || 0) + fx[k];
          else fxCache[k] = (fxCache[k] || 1) * fx[k];
        }
      }
    }
    return fxCache[key] !== undefined ? fxCache[key] : D.TECH_ADD.includes(key) ? 0 : 1;
  };
  Tech.reset = () => { fxCache = null; };

  // ¿Este edificio o receta todavía necesita investigarse?
  Tech.lockOf = function (kind, val) {
    for (const id in D.TECH) {
      const u = D.TECH[id].unlock;
      if (u && u[kind] === val && !Tech.done(id)) return id;
    }
    return null;
  };
  Tech.buildLocked = type => Tech.lockOf('build', type);
  Tech.recipeLocked = (type, r) => Tech.lockOf('recipe', type + '.' + r);

  // Cuánto falta de un recurso para la investigación actual.
  Tech.need = function (k) {
    const r = Tech.st();
    if (!r || !r.cur) return 0;
    const cost = D.TECH[r.cur].cost[k] || 0, got = (r.prog[r.cur] || {})[k] || 0;
    return Math.max(0, cost - got);
  };

  Tech.progress = function (id) {
    const r = Tech.st(), t = D.TECH[id], got = (r && r.prog[id]) || {};
    let a = 0, b = 0;
    for (const k in t.cost) { a += Math.min(t.cost[k], got[k] || 0); b += t.cost[k]; }
    return b ? a / b : 0;
  };

  function cartografos() {
    const out = [];
    for (const isl of PV.state.islands) if (isl.owned && isl.buildings) for (const b of isl.buildings) if (b.type === 'cartografo') out.push([isl, b]);
    return out;
  }

  // Lo que tienen los cartógrafos y ya no sirve vuelve al almacén de su isla.
  function returnLeftovers() {
    for (const [isl, b] of cartografos()) {
      for (const k in b.inv) if (Tech.need(k) < b.inv[k]) {
        const extra = b.inv[k] - Tech.need(k);
        PV.Inv.add(isl.storage, k, extra); PV.Inv.add(b.inv, k, -extra);
      }
      b.prog = 0;
    }
  }

  Tech.start = function (id) {
    const r = Tech.st();
    if (!Tech.available(id)) return;
    r.cur = r.cur === id ? null : id;
    returnLeftovers();
  };

  // Un objeto estudiado por el cartógrafo.
  Tech.study = function (k) {
    const r = Tech.st();
    if (!r.cur || !Tech.need(k)) return;
    const p = r.prog[r.cur] = r.prog[r.cur] || {};
    p[k] = (p[k] || 0) + 1;
    if (Object.keys(D.TECH[r.cur].cost).every(c => !Tech.need(c))) Tech.complete();
  };

  Tech.complete = function () {
    const r = Tech.st(), id = r.cur, t = D.TECH[id];
    r.done[id] = true;
    delete r.prog[id];
    r.cur = null;
    fxCache = null;
    returnLeftovers();
    PV.UI.toast(`🗺️ ¡Investigación completa: ${t.n}! ${t.desc}`, 'good');
    setTimeout(() => PV.UI.toast('Elegí la próxima investigación con la tecla I o haciendo clic en un Cartógrafo.'), 2500);
    if (PV.UI.researchOpen()) PV.UI.renderResearch();
  };

  // Partidas viejas: lo que ya estaba construido o en uso se da por investigado.
  Tech.migrate = function () {
    const r = Tech.st();
    for (const isl of PV.state.islands) for (const b of isl.buildings || []) {
      for (const id in D.TECH) {
        const u = D.TECH[id].unlock;
        if (!u) continue;
        if (u.build === b.type || (b.recipe && u.recipe === b.type + '.' + b.recipe)) {
          r.done[id] = true;
          for (const q of D.TECH[id].req || []) r.done[q] = true;
        }
      }
    }
    fxCache = null;
  };

  Tech.curName = function () {
    const r = Tech.st();
    return r && r.cur ? D.TECH[r.cur].n : null;
  };

  PV.Tech = Tech;
})(window.PV);
