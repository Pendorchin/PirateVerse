// Puertos: mercado con precios dinámicos, astillero (mejoras) y reparación.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D, Wd = PV.World;
  const Port = { isl: null, tab: 'mercado' };

  Port.refuses = (isl, k) => Wd.zone(isl).refuses.includes(k);
  // 1 = cerca del centro, 2 = lejos, 3 = en las puntas del mapa.
  Port.far = function (isl) {
    const c = Wd.SIZE / 2, d = Math.hypot(isl.x - c, isl.y - c);
    return d < D.FAR[0] ? 1 : d < D.FAR[1] ? 2 : 3;
  };
  const names = ks => ks.map(k => D.RES[k].n.toLowerCase()).join(', ');
  Port.names = names;
  Port.zoneLine = isl => {
    const Z = Wd.zone(isl);
    return `Vende ${names(Z.goods)}. Paga bien ${names(Z.wants)}.${Z.refuses.length ? ' No compra ' + names(Z.refuses) + '.' : ''}`;
  };

  Port.sellPrice = (isl, k) => Math.max(1, Math.round(D.RES[k].p * isl.market[k].m * isl.market[k].f * PV.Tech.fx('sell')));
  Port.buyPrice = (isl, k) => Math.max(2, Math.round(D.RES[k].p * isl.market[k].m * isl.market[k].f * 1.35));

  // Los precios vuelven de a poco a su valor normal y lo que vende el puerto se repone (lleno en ~5 minutos).
  Port.update = function (dt) {
    for (const isl of PV.state.islands) {
      if (!isl.port) continue;
      for (const k in isl.market) {
        const m = isl.market[k];
        m.f += (1 - m.f) * Math.min(1, dt * 0.01);
        if (m.s !== undefined) { const mx = Wd.stockMax(k); m.s = Math.min(mx, m.s + (mx / 300) * dt); }
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
    if (Port.refuses(isl, k)) return PV.UI.toast(`En ${isl.name} no compran ${D.RES[k].n.toLowerCase()}.`, 'bad');
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
    const n0 = PV.Inv.sum(cargo);
    const got = Port.sellAll(Port.isl, cargo);
    const left = Object.keys(cargo), n = n0 - PV.Inv.sum(cargo);
    for (const k in keep) cargo[k] = (cargo[k] || 0) + keep[k];
    if (left.length) PV.UI.toast(`Acá no compran ${names(left)}: quedó en la bodega.`, 'bad');
    S.doblones += got;
    S.sold = (S.sold || 0) + n;
    if (n) PV.UI.toast(`Vendiste ${n} unidades por ${got} doblones`, 'good');
  }

  // Venta automática de una bodega entera (la usan los mercantes). Lo que el puerto no compra queda en la bodega.
  Port.sellAll = function (isl, cargo) {
    let got = 0;
    for (const k of Object.keys(cargo)) {
      if (Port.refuses(isl, k)) continue;
      const m = isl.market[k];
      for (let i = cargo[k]; i > 0; i--) { got += Port.sellPrice(isl, k); m.f = Math.max(0.3, m.f * 0.985); }
      delete cargo[k];
    }
    return got;
  };

  function buy(k, n) {
    const S = PV.state, isl = Port.isl, m = isl.market[k];
    if (m.s === undefined) return PV.UI.toast(`En ${isl.name} no venden ${D.RES[k].n.toLowerCase()}.`, 'bad');
    let spent = 0, bought = 0;
    while (n-- > 0) {
      if (m.s < 1) { PV.UI.toast(`No les queda ${D.RES[k].n.toLowerCase()}: se repone con el tiempo.`, 'bad'); break; }
      const p = Port.buyPrice(isl, k);
      if (S.doblones < p) { if (!bought) PV.UI.toast('No te alcanzan los doblones.', 'bad'); break; }
      if (!PV.Inv.addCargo(k, 1)) { PV.UI.toast('La bodega está llena.', 'bad'); break; }
      S.doblones -= p; spent += p; bought++; m.s--;
      m.f = Math.min(3, m.f * 1.03);
    }
    if (bought) PV.UI.toast(`Compraste ${bought} ${D.RES[k].n} por ${spent} doblones`, 'good');
  }

  // Materiales que se habían entregado en un puerto (partidas viejas): se descuentan.
  function matsLeft(key, cost) {
    const d = (PV.state.ship.dep || {})[key] || {}, left = {};
    for (const k in cost) if (k !== 'doblones' && (d[k] || 0) < cost[k]) left[k] = cost[k] - (d[k] || 0);
    return left;
  }

  // Mejoras de tu barco: se hacen en el Astillero de tu isla. Lo que ya habías entregado
  // en un puerto (partidas viejas) se descuenta; el resto sale del almacén y de la bodega.
  function upLeft(key) {
    const S = PV.state, next = D.UP[key].lv[S.ship.up[key] + 1];
    if (!next) return null;
    const c = matsLeft(key, next.cost);
    if (next.cost.doblones) c.doblones = next.cost.doblones;
    return c;
  }

  // El último nivel de cada mejora pide el plano de casco reforzado (puertos muy lejanos).
  const needsRef = key => PV.state.ship.up[key] + 2 >= D.UP[key].lv.length && !PV.Fleet.plans().casco_ref;

  Port.upgradeAt = function (key, isl) {
    const S = PV.state, up = D.UP[key], lv = S.ship.up[key], c = upLeft(key);
    if (!c) return;
    if (needsRef(key)) return PV.UI.toast('Te falta el plano de casco reforzado: se vende en los puertos muy lejanos.', 'bad');
    if (!PV.Inv.canPay(c, isl)) return PV.UI.toast('Faltan materiales o doblones.', 'bad');
    const oldMax = PV.Sea.stats().maxHp;
    PV.Inv.pay(c, isl);
    if (S.ship.dep) delete S.ship.dep[key];
    S.ship.up[key]++;
    if (key === 'casco') S.ship.hp += PV.Sea.stats().maxHp - oldMax;
    PV.UI.toast(`¡${up.n} mejorada a nivel ${lv + 2}!`, 'good');
  };

  Port.shipUpHtml = function (isl) {
    const S = PV.state, sc = PV.Spr.shipClass(S.ship.up);
    const shipImg = c => `<img class="shipart" src="${PV.Spr.src(c.img)}" alt="${c.n}">`;
    const hero = `<div class="shipclass">
        <div class="shipcard">${shipImg(sc.cur)}<div><b>${sc.cur.n}</b><div class="sub">Tu barco · ${sc.lv} mejoras</div></div></div>
        ${sc.next ? `<div class="arrow">→</div><div class="shipcard dim">${shipImg(sc.next)}<div><b>${sc.next.n}</b>
          <div class="sub">Faltan ${sc.next.min - sc.lv} mejoras</div></div></div>` : '<div class="sub">¡El barco más grande del archipiélago!</div>'}
      </div>`;
    return hero + Object.keys(D.UP).map(k => {
      const up = D.UP[k], lv = S.ship.up[k], cur = up.lv[lv], next = up.lv[lv + 1], c = upLeft(k);
      const pips = up.lv.map((_, i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
      const right = next && needsRef(k)
        ? `<div style="text-align:right"><div>→ ${up.fmt(next)}</div><small class="muted">🔒 Plano de casco reforzado (puertos muy lejanos)</small></div>`
        : next
        ? `<div style="text-align:right"><div>→ ${up.fmt(next)}</div><div style="font-size:12px;margin:3px 0">${PV.Island.costTxt(c)}</div>
           <button class="primary" data-v="sy:me:${k}" ${PV.Inv.canPay(c, isl) ? '' : 'disabled'}>Mejorar</button></div>`
        : '<b>Nivel máximo</b>';
      return `<div class="upg"><div class="ic">${up.icon}</div>
        <div><h4>${up.n} <span class="lvl">${pips}</span></h4><div class="sub">${up.desc}: ${up.fmt(cur)}</div></div>${right}</div>`;
    }).join('');
  };

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
    else if (a === 'buyship') PV.Fleet.buy(Port.isl);
    else if (a === 'plan') PV.Fleet.buyPlan(el.dataset.k);
    else if (a === 'fhome' || a === 'fport') PV.Fleet.cycle(+el.dataset.i, a === 'fhome' ? 'home' : 'port');
    else if (a === 'repair') repair();
    else if (a === 'hire') PV.Crew.hire(Port.isl, +el.dataset.i);
    else if (a === 'fire') PV.Crew.fire(+el.dataset.i);
    Port.render();
  };

  function marketHtml() {
    const S = PV.state, isl = Port.isl, cargo = S.ship.cargo;
    const Z = Wd.zone(isl);
    // Se muestra lo que llevás, lo que vende el puerto y lo que busca.
    const rank = k => (cargo[k] ? 0 : Z.goods.includes(k) ? 1 : Z.wants.includes(k) ? 2 : 3);
    const keys = Object.keys(D.RES).filter(k => cargo[k] || isl.market[k].s !== undefined || Z.wants.includes(k))
      .sort((a, b) => rank(a) - rank(b) || (cargo[b] || 0) - (cargo[a] || 0));
    const rows = keys.map(k => {
      const have = cargo[k] || 0, m = isl.market[k], no = Port.refuses(isl, k), sale = m.s !== undefined;
      const tag = no ? '<span class="down">✖ no lo compran</span>'
        : Z.wants.includes(k) ? '<span class="up">▲ lo buscan</span>'
        : Z.goods.includes(k) ? '<span class="local">⚓ de la zona</span>'
        : m.f < 0.8 ? '<span class="down">▼ saturado</span>' : '';
      const stock = sale ? Math.floor(m.s) : 0;
      return `<tr>
        <td><i class="dot" style="background:${D.RES[k].c}"></i> ${D.RES[k].n} ${tag}</td>
        <td>${have}</td>
        <td>${no ? '—' : Port.sellPrice(isl, k) + ' <i class="coin"></i>'}</td>
        <td><button data-act="sell" data-k="${k}" data-n="1" ${have && !no ? '' : 'disabled'}>Vender 1</button><button data-act="sell" data-k="${k}" data-n="9999" ${have && !no ? '' : 'disabled'}>Todo</button></td>
        <td>${sale ? `${Port.buyPrice(isl, k)} <i class="coin"></i> <small class="muted">(quedan ${stock})</small>` : '<span class="muted">no venden</span>'}</td>
        <td>${sale ? `<button data-act="buy" data-k="${k}" data-n="1" ${stock ? '' : 'disabled'}>Comprar 1</button><button data-act="buy" data-k="${k}" data-n="10" ${stock ? '' : 'disabled'}>10</button>` : ''}</td>
      </tr>`;
    }).join('');
    const sellable = Object.keys(cargo).filter(k => !AMMO_KEYS.includes(k));
    const est = sellable.reduce((t, k) => t + Port.sellPrice(isl, k) * cargo[k], 0);
    return `<div class="sellall"><button class="primary" data-act="sellall" ${sellable.length ? '' : 'disabled'}>Vender toda la bodega</button>
        <span class="muted">${sellable.length ? `≈ ${U.fmt(est)} <i class="coin"></i> · la munición no se vende` : 'No hay nada para vender.'}</span></div>
      <p class="zoneinfo">🧭 <b>${Z.n}:</b> ${Port.zoneLine(isl)}</p>
      <p class="muted">Lo de la zona sale barato acá y se paga bien en otros mares. Si vendés mucho de algo, el precio baja (y se recupera con el tiempo). Lo que venden se repone de a poco.</p>
      <table class="market"><tr><th>Recurso</th><th>En bodega</th><th>Te pagan</th><th></th><th>Cuesta</th><th></th></tr>${rows}</table>`;
  }

  function shipyardHtml() {
    return plansHtml() + `<h3 style="margin:12px 0 4px">🔨 Tu barco</h3><p class="muted">Las mejoras de tu barco ahora se hacen en el <b>Astillero</b> de tu isla (tecla <kbd>Y</kbd>, pestaña Logística). Los materiales salen del almacén de la isla y de tu bodega.</p>`;
  }

  // Planos de barcos mejorados: se compran acá y se usan en el Astillero de tu isla.
  function plansHtml() {
    const F = PV.Fleet, S = PV.state;
    const far = Port.far(Port.isl);
    const rows = Object.keys(D.PLANS).map(id => {
      const P = D.PLANS[id], have = F.plans()[id], need = P.req && !F.plans()[P.req], away = (P.far || 1) > far;
      const btn = have ? '<b>✔ Ya lo tenés</b>'
        : away ? `<span class="muted">Se vende en puertos ${P.far === 3 ? 'muy lejanos' : 'lejanos'}</span>`
        : need ? '<span class="muted">Primero el nivel anterior</span>'
        : `<button class="primary" data-act="plan" data-k="${id}" ${S.doblones >= P.p ? '' : 'disabled'}>Comprar (${U.fmt(P.p)} <i class="coin"></i>)</button>`;
      if (P.ship) return `<div class="upg"><div class="ic">⚓</div><div><h4>Plano: ${P.n}</h4><div class="sub">${P.desc}</div></div>${btn}</div>`;
      const L = D.SHIP_LV[P.kind][P.lv];
      return `<div class="upg"><div class="ic">📜</div><div><h4>Plano: ${D.SHIP_NAMES[P.kind]} ${F.roman(P.lv)}</h4>
        <div class="sub">Carga ${L.cap} · velocidad ${Math.round(L.spd * 100)}% · se construye con ${PV.Island.costTxt(L.cost)}</div></div>${btn}</div>`;
    }).join('');
    return `<h3 style="margin:4px 0">📜 Planos de barcos</h3>
      <p class="muted">Con el plano, el <b>Astillero</b> que construyas en tu isla (tecla <kbd>Y</kbd>) puede hacer ese barco o mejorar los que ya tenés.</p>${rows}`;
  }

  function fleetHtml() {
    const L = PV.Fleet.list(), M = D.MERCHANT, isl = id => PV.state.islands[id];
    const rows = L.map((m, i) => `<div class="fleet"><img src="${PV.Spr.src('barco_mercante')}" alt="">
      <div><h4 style="margin:0">${m.name} <small class="muted">· nivel ${PV.Fleet.roman(m.ml)} · carga ${PV.Fleet.cap(m)} · velocidad ${Math.round(PV.Fleet.speedOf(m) / M.speed * 100)}%</small></h4><div class="sub">${isl(m.home).name} → ${isl(m.port).name} <span class="muted">(${Wd.zone(isl(m.port)).n})</span></div>
        <div class="sub muted">Paga bien ${names(Wd.zone(isl(m.port)).wants)}${Wd.zone(isl(m.port)).refuses.length ? ' · no compra ' + names(Wd.zone(isl(m.port)).refuses) : ''}</div>
        <div class="sub">${PV.Fleet.status(m)} · ganó ${U.fmt(m.earned)} <i class="coin"></i></div></div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button data-act="fhome" data-i="${i}">Cambiar isla</button><button data-act="fport" data-i="${i}">Cambiar puerto</button></div></div>`).join('');
    const full = L.length >= M.max, cost = PV.Fleet.nextCost(1), nxt = { ml: 1 };
    const can = !full && PV.Inv.canPay(cost, null);
    return `<p class="muted">Los mercantes cargan solos en el <b>muelle</b> de tu isla, navegan al puerto, venden todo y vuelven. Cada mercante extra cuesta más. Acá se compran de nivel I; los de nivel II y III se construyen en un <b>Astillero</b> de tu isla con el plano (pestaña 🔨 Astillero).</p>
      ${rows || '<p class="muted">Todavía no tenés mercantes.</p>'}
      <div class="fleet"><img src="${PV.Spr.src('barco_mercante')}" alt="" style="filter:grayscale(.6)">
        <div><h4 style="margin:0">Comprar mercante I</h4>
          <div class="sub">${full ? 'Ya tenés el máximo.' : `${PV.Inv.costHtml(cost, null)} · carga ${PV.Fleet.cap(nxt)} · velocidad ${Math.round(PV.Fleet.speedOf(nxt) / M.speed * 100)}%`} · ${L.length}/${M.max}</div></div>
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
    const body = Port.tab === 'mercado' ? marketHtml() : Port.tab === 'astillero' ? shipyardHtml() : Port.tab === 'flota' ? fleetHtml() : Port.tab === 'taberna' ? PV.Crew.html(isl) : repairHtml();
    el.innerHTML = `
      <div class="ph"><h2>⚓ ${isl.name} <small class="muted">· ${Wd.zone(isl).n}</small></h2>
        <div><i class="coin"></i> <b>${U.fmt(S.doblones)}</b> · <i class="crate"></i> ${PV.Inv.cargoTotal()}/${PV.Inv.cargoCap()}</div>
        <button class="primary" data-act="close">⛵ Zarpar (Esc)</button></div>
      <div class="tabs">${tab('mercado', '🪙 Mercado')}${tab('astillero', '🔨 Astillero')}${tab('flota', '⛵ Flota')}${tab('taberna', '🍺 Taberna')}${tab('reparar', '🩹 Reparar')}</div>
      <div class="pbody">${body}</div>`;
    el.querySelector('.pbody').scrollTop = scroll;
  };

  PV.Port = Port;
})(window.PV);
