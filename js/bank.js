// Banquero: guarda doblones en una isla (no se pierden al hundirte), paga interés
// y, con investigación, permite inversiones con riesgo. Los piratas pueden asaltar el banco.
// Cada isla con banquero tiene isl.bank = { saved, inv: [{ k, amt, t }] }.
(function (PV) {
  'use strict';
  const D = PV.D, U = PV.U;
  const Bank = {};
  let raidT = 0;

  Bank.of = isl => isl.bank || (isl.bank = { saved: 0, inv: [] });
  Bank.has = isl => !!(isl && isl.owned && (isl.buildings || []).some(b => b.type === 'banco'));
  Bank.islands = () => PV.state.islands.filter(Bank.has);
  Bank.total = () => PV.state.islands.reduce((t, i) => t + (i.bank ? i.bank.saved : 0), 0);
  Bank.rate = () => D.BANK.rate * PV.Tech.fx('bankRate');          // por minuto
  Bank.cap = () => Math.round(D.BANK.cap * PV.Tech.fx('bankCap'));  // interés solo hasta este saldo

  Bank.deposit = function (isl, n) {
    const S = PV.state;
    n = Math.min(Math.floor(n), S.doblones);
    if (n <= 0) return PV.UI.toast('No tenés doblones para guardar.', 'bad');
    S.doblones -= n; Bank.of(isl).saved += n;
    PV.UI.toast(`🏦 Guardaste ${U.fmt(n)} doblones.`, 'good');
  };

  Bank.withdraw = function (isl, n) {
    const b = Bank.of(isl);
    n = Math.min(Math.floor(n), Math.floor(b.saved));
    if (n <= 0) return PV.UI.toast('No hay doblones guardados.', 'bad');
    b.saved -= n; PV.state.doblones += n;
    PV.UI.toast(`🏦 Retiraste ${U.fmt(n)} doblones.`, 'good');
  };

  Bank.invest = function (isl, k, n) {
    const S = PV.state, o = D.BANK.INVEST[k];
    if (PV.Tech.lockOf('feature', 'inversiones')) return;
    if (S.doblones < n) return PV.UI.toast('No te alcanzan los doblones (se invierte lo que llevás encima).', 'bad');
    S.doblones -= n;
    Bank.of(isl).inv.push({ k, amt: n, t: o.t });
    PV.UI.toast(`${o.icon} Invertiste ${U.fmt(n)} en «${o.n}». Vuelve en ${Math.round(o.t / 60)} min.`, 'good');
  };

  // Resultado de una inversión: se tira una vez al terminar.
  function settle(isl, it) {
    const o = D.BANK.INVEST[it.k], win = Math.random() < o.p;
    const back = Math.max(0, Math.round(it.amt * (1 + (win ? o.win : -o.lose))));
    Bank.of(isl).saved += back;
    const diff = back - it.amt;
    PV.UI.toast(`${o.icon} «${o.n}» ${win ? 'salió bien' : 'salió mal'}: ${diff >= 0 ? 'ganaste' : 'perdiste'} ${U.fmt(Math.abs(diff))}. Quedó guardado en el banco de ${isl.name}.`, win ? 'good' : 'bad');
  }

  Bank.update = function (dt) {
    const S = PV.state;
    if (!S) return;
    const list = Bank.islands();
    for (const isl of list) {
      const b = Bank.of(isl);
      b.saved += Math.min(b.saved, Bank.cap()) * Bank.rate() * dt / 60;
      for (const it of b.inv) it.t -= dt;
      for (const it of b.inv.filter(i => i.t <= 0)) settle(isl, it);
      b.inv = b.inv.filter(i => i.t > 0);
    }
    // Asaltos piratas: de vez en cuando roban una parte de lo guardado.
    raidT += dt;
    if (raidT >= D.BANK.raidEvery) {
      raidT = 0;
      for (const isl of list) {
        const b = Bank.of(isl);
        if (b.saved < D.BANK.raidMin || Math.random() > D.BANK.raidChance) continue;
        const lost = Math.round(b.saved * D.BANK.raidLoss / PV.Tech.fx('vault'));
        b.saved -= lost;
        PV.UI.toast(`🏴‍☠️ ¡Piratas asaltaron el banco de ${isl.name} y se llevaron ${U.fmt(lost)} doblones!`, 'bad');
      }
    }
  };

  // Al quitar el edificio, lo guardado vuelve al capitán (las inversiones siguen y cobran cuando se reconstruya).
  Bank.onRemove = function (isl) {
    const b = isl.bank;
    if (!b || Bank.has(isl)) return;
    if (b.saved >= 1) { PV.state.doblones += Math.floor(b.saved); PV.UI.toast(`🏦 Te devolvieron ${U.fmt(Math.floor(b.saved))} doblones del banco.`); }
    b.saved = 0;
  };

  PV.Bank = Bank;
})(window.PV);
