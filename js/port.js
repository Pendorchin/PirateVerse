// Puertos: mercado con precios dinámicos, astillero (mejoras) y reparación.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D;
  const Port = { isl: null, tab: 'mercado' };

  Port.sellPrice = (isl, k) => Math.max(1, Math.round(D.RES[k].p * isl.market[k].m * isl.market[k].f));
  Port.buyPrice = (isl, k) => Math.max(2, Math.round(D.RES[k].p * isl.market[k].m * isl.market[k].f * 1.35));

  // Los precios vuelven de a poco a su valor normal.
  Port.update = function (dt) {
    for (const isl of PV.state.islands) {
      if (!isl.port) continue;
      for (const k in isl.market) {
        const m = isl.market[k];
        m.f += (1 - m.f) * Math.min(1, dt * 0.01);
      }
    }
  };

  Port.open = function (isl) {
    Port.isl = isl;
    Port.tab = 'mercado';
    PV.state.ship.v = 0;
    PV.setScene('port');
    Port.render();
  };

  Port.close = function () {
    Port.isl = null;
    PV.setScene('sea');
    PV.Save.save();
  };

  function sell(k, n) {
    const S = PV.state, isl = Port.isl, m = isl.market[k];
    let got = 0, sold = 0;
    while (n-- > 0 && S.ship.cargo[k] > 0) {
      got += Port.sellPrice(isl, k);
      PV.Inv.add(S.ship.cargo, k, -1);
      m.f = Math.max(0.3, m.f * 0.97);
      sold++;
      S.sold = (S.sold || 0) + 1;
    }
    S.doblones += got;
    if (sold) PV.UI.toast(`Vendiste ${sold} ${D.RES[k].n} por ${got} doblones`, 'good');
  }

  // Vende todo lo de la bodega menos la munición.
  const AMMO_KEYS = D.AMMO.map(a => a.k);
  function sellCargo() {
    const S = PV.state, cargo = S.ship.cargo, keep = {};
    for (const k of AMMO_KEYS) if (cargo[k]) { keep[k] = cargo[k]; delete cargo[k]; }
    const n = PV.Inv.sum(cargo);
    const got = Port.sellAll(Port.isl, cargo);
    Object.assign(cargo, keep);
    S.doblones += got;
    S.sold = (S.sold || 0) + n;
    if (n) PV.UI.toast(`Vendiste ${n} unidades por ${got} doblones`, 'good');
  }

  // Venta automática de una bodega entera (la usan los mercantes).
  Port.sellAll = function (isl, cargo) {
    let got = 0;
    for (const k of Object.keys(cargo)) {
      const m = isl.market[k];
      for (let i = cargo[k]; i > 0; i--) { got += Port.sellPrice(isl, k); m.f = Math.max(0.3, m.f * 0.985); }
      delete cargo[k];
    }
    return got;
  };

  function buy(k, n) {
    const S = PV.state, isl = Port.isl, m = isl.market[k];
    let spent = 0, bought = 0;
    while (n-- > 0) {
      const p = Port.buyPrice(isl, k);
      if (S.doblones < p) { if (!bought) PV.UI.toast('No te alcanzan los doblones.', 'bad'); break; }
      if (!PV.Inv.addCargo(k, 1)) { PV.UI.toast('La bodega está llena.', 'bad'); break; }
      S.doblones -= p; spent += p; bought++;
      m.f = Math.min(3, m.f * 1.03);
    }
    if (bought) PV.UI.toast(`Compraste ${bought} ${D.RES[k].n} por ${spent} doblones`, 'good');
  }

  // Materiales ya entregados al astillero para la próxima mejora de cada parte.
  // Se pueden llevar en varios viajes; se guardan aunque zarpes.
  function dep(key) {
    const S = PV.state;
    S.ship.dep = S.ship.dep || {};
    return S.ship.dep[key] = S.ship.dep[key] || {};
  }
  function matsLeft(key, cost) {
    const d = dep(key), left = {};
    for (const k in cost) if (k !== 'doblones' && (d[k] || 0) < cost[k]) left[k] = cost[k] - (d[k] || 0);
    return left;
  }
  function canDeliver(key, cost) {
    const left = matsLeft(key, cost), cargo = PV.state.ship.cargo;
    return Object.keys(left).some(k => cargo[k] > 0);
  }

  // ¿Alcanza lo entregado + lo que hay en la bodega para completar los materiales?
  function matsReady(key, cost) {
    const left = matsLeft(key, cost), cargo = PV.state.ship.cargo;
    return Object.keys(left).every(k => (cargo[k] || 0) >= left[k]);
  }

  function deliver(key, quiet) {
    const S = PV.state, next = D.UP[key].lv[S.ship.up[key] + 1];
    if (!next) return;
    const left = matsLeft(key, next.cost), d = dep(key);
    let n = 0;
    for (const k in left) {
      const a = Math.min(left[k], S.ship.cargo[k] || 0);
      if (!a) continue;
      PV.Inv.add(S.ship.cargo, k, -a);
      d[k] = (d[k] || 0) + a; n += a;
    }
    if (quiet) return;
    if (!n) return PV.UI.toast('No llevás ninguno de los materiales que faltan.', 'bad');
    const faltan = Object.keys(matsLeft(key, next.cost)).length;
    PV.UI.toast(faltan ? `Entregaste ${n} materiales. Traé el resto en otro viaje.` : 'Materiales completos: ya podés mejorar.', 'good');
  }

  function upgrade(key) {
    const S = PV.state, up = D.UP[key], lv = S.ship.up[key], next = up.lv[lv + 1];
    if (!next) return;
    if (!matsReady(key, next.cost)) return PV.UI.toast('Todavía faltan materiales.', 'bad');
    if (S.doblones < (next.cost.doblones || 0)) return PV.UI.toast('No te alcanzan los doblones.', 'bad');
    deliver(key, true); // lo que falta y está en la bodega se entrega al mejorar
    const oldMax = PV.Sea.stats().maxHp;
    S.doblones -= next.cost.doblones || 0;
    delete S.ship.dep[key];
    S.ship.up[key]++;
    if (key === 'casco') S.ship.hp += PV.Sea.stats().maxHp - oldMax;
    PV.UI.toast(`¡${up.n} mejorada a nivel ${lv + 2}!`, 'good');
  }

  function repair() {
    const S = PV.state, st = PV.Sea.stats();
    const missing = Math.ceil(st.maxHp - S.ship.hp), cost = Math.ceil(missing * 0.8);
    if (!missing) return;
    if (S.doblones < cost) return PV.UI.toast('No te alcanzan los doblones.', 'bad');
    S.doblones -= cost;
    S.ship.hp = st.maxHp;
    PV.UI.toast('Barco reparado.', 'good');
  }

  Port.action = function (el) {
    const a = el.dataset.act;
    if (a === 'close') return Port.close();
    if (a === 'tab') Port.tab = el.dataset.tab;
    else if (a === 'sell') sell(el.dataset.k, +el.dataset.n);
    else if (a === 'sellall') sellCargo();
    else if (a === 'buy') buy(el.dataset.k, +el.dataset.n);
    else if (a === 'up') upgrade(el.dataset.k);
    else if (a === 'dep') deliver(el.dataset.k);
    else if (a === 'buyship') PV.Fleet.buy(Port.isl);
    else if (a === 'fhome' || a === 'fport') PV.Fleet.cycle(+el.dataset.i, a === 'fhome' ? 'home' : 'port');
    else if (a === 'repair') repair();
    Port.render();
  };

  function marketHtml() {
    const S = PV.state, isl = Port.isl, cargo = S.ship.cargo;
    const keys = Object.keys(D.RES).sort((a, b) => (cargo[b] || 0) - (cargo[a] || 0));
    const rows = keys.map(k => {
      const have = cargo[k] || 0, m = isl.market[k], rel = m.m * m.f;
      const trend = rel > 1.12 ? '<span class="up">▲ paga bien</span>' : rel < 0.88 ? '<span class="down">▼ barato</span>' : '';
      return `<tr>
        <td><i class="dot" style="background:${D.RES[k].c}"></i> ${D.RES[k].n} ${trend}</td>
        <td>${have}</td>
        <td>${Port.sellPrice(isl, k)} <i class="coin"></i></td>
        <td><button data-act="sell" data-k="${k}" data-n="1" ${have ? '' : 'disabled'}>Vender 1</button><button data-act="sell" data-k="${k}" data-n="9999" ${have ? '' : 'disabled'}>Todo</button></td>
        <td>${Port.buyPrice(isl, k)} <i class="coin"></i></td>
        <td><button data-act="buy" data-k="${k}" data-n="1">Comprar 1</button><button data-act="buy" data-k="${k}" data-n="10">10</button></td>
      </tr>`;
    }).join('');
    const sellable = Object.keys(cargo).filter(k => !AMMO_KEYS.includes(k));
    const est = sellable.reduce((t, k) => t + Port.sellPrice(isl, k) * cargo[k], 0);
    return `<div class="sellall"><button class="primary" data-act="sellall" ${sellable.length ? '' : 'disabled'}>Vender toda la bodega</button>
        <span class="muted">${sellable.length ? `≈ ${U.fmt(est)} <i class="coin"></i> · la munición no se vende` : 'No hay nada para vender.'}</span></div>
      <p class="muted">Cada puerto paga distinto. Si vendés mucho de algo, el precio baja (y se recupera con el tiempo).</p>
      <table class="market"><tr><th>Recurso</th><th>En bodega</th><th>Te pagan</th><th></th><th>Cuesta</th><th></th></tr>${rows}</table>`;
  }

  // Costo con progreso: "30/40 Tablones" (verde si está completo, y cuánto traés en la bodega).
  function depHtml(key, cost) {
    const d = dep(key), cargo = PV.state.ship.cargo;
    return Object.keys(cost).map(k => {
      if (k === 'doblones') return `<span class="cost ${PV.state.doblones >= cost[k] ? '' : 'miss'}">${cost[k]} <i class="coin"></i></span>`;
      const got = d[k] || 0, ok = got >= cost[k], c = cargo[k] || 0;
      return `<span class="cost ${ok ? '' : 'miss'}">${got}/${cost[k]} ${D.RES[k].n}${!ok && c ? ` <small>(+${Math.min(c, cost[k] - got)} en bodega)</small>` : ''}</span>`;
    }).join(' ');
  }

  function shipyardHtml() {
    const S = PV.state, sc = PV.Spr.shipClass(S.ship.up);
    const shipImg = c => `<img class="shipart" src="${PV.Spr.src(c.img)}" alt="${c.n}">`;
    const hero = `<div class="shipclass">
        <div class="shipcard">${shipImg(sc.cur)}<div><b>${sc.cur.n}</b><div class="sub">Tu barco · ${sc.lv} mejoras</div></div></div>
        ${sc.next ? `<div class="arrow">→</div><div class="shipcard dim">${shipImg(sc.next)}<div><b>${sc.next.n}</b>
          <div class="sub">Faltan ${sc.next.min - sc.lv} mejoras</div></div></div>` : '<div class="sub">¡El barco más grande del archipiélago!</div>'}
      </div>`;
    return hero + `<p class="muted">Los materiales se entregan de a poco: traelos en la bodega, tocá <b>Entregar</b> y quedan guardados en el astillero hasta completar la mejora.</p>` +
      Object.keys(D.UP).map(k => {
        const up = D.UP[k], lv = S.ship.up[k], cur = up.lv[lv], next = up.lv[lv + 1];
        const pips = up.lv.map((_, i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
        const right = next
          ? `<div style="text-align:right"><div>→ ${up.fmt(next)}</div><div style="font-size:12px;margin:3px 0">${depHtml(k, next.cost)}</div>
             <button data-act="dep" data-k="${k}" ${canDeliver(k, next.cost) ? '' : 'disabled'}>Entregar</button>
             <button class="primary" data-act="up" data-k="${k}" ${matsReady(k, next.cost) && S.doblones >= (next.cost.doblones || 0) ? '' : 'disabled'}>Mejorar</button></div>`
          : '<b>Nivel máximo</b>';
        return `<div class="upg"><div class="ic">${up.icon}</div>
          <div><h4>${up.n} <span class="lvl">${pips}</span></h4><div class="sub">${up.desc}: ${up.fmt(cur)}</div></div>${right}</div>`;
      }).join('');
  }

  function fleetHtml() {
    const L = PV.Fleet.list(), M = D.MERCHANT, isl = id => PV.state.islands[id];
    const rows = L.map((m, i) => `<div class="fleet"><img src="${PV.Spr.src('barco_mercante')}" alt="">
      <div><h4 style="margin:0">${m.name}</h4><div class="sub">${isl(m.home).name} → ${isl(m.port).name}</div>
        <div class="sub">${PV.Fleet.status(m)} · ganó ${U.fmt(m.earned)} <i class="coin"></i></div></div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button data-act="fhome" data-i="${i}">Cambiar isla</button><button data-act="fport" data-i="${i}">Cambiar puerto</button></div></div>`).join('');
    const can = L.length < M.max && PV.Inv.canPay(M.cost, null);
    return `<p class="muted">Los mercantes cargan solos en el <b>muelle</b> de tu isla, navegan al puerto, venden todo y vuelven. Llevan ${M.cap} de carga.</p>
      ${rows || '<p class="muted">Todavía no tenés mercantes.</p>'}
      <div class="fleet"><img src="${PV.Spr.src('barco_mercante')}" alt="" style="filter:grayscale(.6)">
        <div><h4 style="margin:0">Comprar mercante</h4><div class="sub">${PV.Inv.costHtml(M.cost, null)} · ${L.length}/${M.max}</div></div>
        <button class="primary" data-act="buyship" ${can ? '' : 'disabled'}>Comprar</button></div>`;
  }

  function repairHtml() {
    const S = PV.state, st = PV.Sea.stats();
    const missing = Math.ceil(st.maxHp - S.ship.hp), cost = Math.ceil(missing * 0.8);
    return `<div class="upg"><div class="ic">🩹</div><div><h4>Reparar casco</h4>
      <div class="sub">Vida: ${Math.ceil(S.ship.hp)} / ${st.maxHp}. Cerca de tus islas el barco también se repara solo, despacio.</div></div>
      <button class="primary" data-act="repair" ${missing ? '' : 'disabled'}>${missing ? 'Reparar (' + cost + ' doblones)' : 'Está como nuevo'}</button></div>`;
  }

  Port.render = function () {
    const el = document.getElementById('portPanel'), S = PV.state, isl = Port.isl;
    if (!isl) return;
    const prev = el.querySelector('.pbody');
    const scroll = prev ? prev.scrollTop : 0;
    const tab = (id, label) => `<button data-act="tab" data-tab="${id}" class="${Port.tab === id ? 'on' : ''}">${label}</button>`;
    const body = Port.tab === 'mercado' ? marketHtml() : Port.tab === 'astillero' ? shipyardHtml() : Port.tab === 'flota' ? fleetHtml() : repairHtml();
    el.innerHTML = `
      <div class="ph"><h2>⚓ ${isl.name}</h2>
        <div><i class="coin"></i> <b>${U.fmt(S.doblones)}</b> · <i class="crate"></i> ${PV.Inv.cargoTotal()}/${PV.Inv.cargoCap()}</div>
        <button class="primary" data-act="close">⛵ Zarpar (Esc)</button></div>
      <div class="tabs">${tab('mercado', '🪙 Mercado')}${tab('astillero', '🔨 Astillero')}${tab('flota', '⛵ Flota')}${tab('reparar', '🩹 Reparar')}</div>
      <div class="pbody">${body}</div>`;
    el.querySelector('.pbody').scrollTop = scroll;
  };

  PV.Port = Port;
})(window.PV);
