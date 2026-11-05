// Inventarios: bodega del barco, almacén de cada isla y pago de costos.
(function (PV) {
  'use strict';
  const D = PV.D;
  const Inv = {};

  Inv.sum = function (bag) { let t = 0; for (const k in bag) t += bag[k]; return t; };
  Inv.add = function (bag, k, n) {
    bag[k] = (bag[k] || 0) + n;
    if (bag[k] <= 0) delete bag[k];
  };

  Inv.cargoTotal = () => Inv.sum(PV.state.ship.cargo);
  Inv.cargoCap = () => PV.Sea.stats().cap;
  Inv.addCargo = function (k, n) {
    const a = Math.max(0, Math.min(n, Inv.cargoCap() - Inv.cargoTotal()));
    if (a) Inv.add(PV.state.ship.cargo, k, a);
    return a;
  };

  Inv.storageTotal = isl => Inv.sum(isl.storage);
  Inv.storageCap = isl => (isl._nAlm || 0) * D.STORAGE_PER;

  // Material disponible: bodega del barco + almacén de la isla (si se pasa una).
  Inv.have = (k, isl) => (PV.state.ship.cargo[k] || 0) + (isl ? isl.storage[k] || 0 : 0);

  Inv.canPay = function (cost, isl) {
    for (const k in cost) {
      if (k === 'doblones') { if (PV.state.doblones < cost[k]) return false; }
      else if (Inv.have(k, isl) < cost[k]) return false;
    }
    return true;
  };

  // Paga primero con el almacén de la isla y después con la bodega.
  Inv.pay = function (cost, isl) {
    for (const k in cost) {
      if (k === 'doblones') { PV.state.doblones -= cost[k]; continue; }
      let n = cost[k];
      if (isl) {
        const s = Math.min(n, isl.storage[k] || 0);
        Inv.add(isl.storage, k, -s);
        n -= s;
      }
      if (n) Inv.add(PV.state.ship.cargo, k, -n);
    }
  };

  Inv.refund = function (cost, isl, frac) {
    for (const k in cost) {
      const n = Math.floor(cost[k] * frac);
      if (!n) continue;
      if (k === 'doblones') PV.state.doblones += n;
      else Inv.add(isl.storage, k, n);
    }
  };

  Inv.costHtml = function (cost, isl) {
    return Object.keys(cost).map(k => {
      const ok = k === 'doblones' ? PV.state.doblones >= cost[k] : Inv.have(k, isl) >= cost[k];
      const name = k === 'doblones' ? '<i class="coin"></i>' : D.RES[k].n;
      return `<span class="cost ${ok ? '' : 'miss'}">${cost[k]} ${name}</span>`;
    }).join(' · ');
  };

  Inv.chips = function (bag) {
    const keys = Object.keys(bag).sort((a, b) => bag[b] - bag[a]);
    if (!keys.length) return '<span class="muted">vacío</span>';
    return keys.map(k => `<span class="chip"><i style="background:${D.RES[k].c}"></i>${D.RES[k].n} ${bag[k]}</span>`).join('');
  };

  PV.Inv = Inv;
})(window.PV);
