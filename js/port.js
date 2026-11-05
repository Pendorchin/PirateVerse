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
    }
    S.doblones += got;
    if (sold) PV.UI.toast(`Vendiste ${sold} ${D.RES[k].n} por ${got} 💰`, 'good');
  }

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
    if (bought) PV.UI.toast(`Compraste ${bought} ${D.RES[k].n} por ${spent} 💰`, 'good');
  }

  function upgrade(key) {
    const S = PV.state, up = D.UP[key], lv = S.ship.up[key], next = up.lv[lv + 1];
    if (!next || !PV.Inv.canPay(next.cost, null)) return;
    const oldMax = PV.Sea.stats().maxHp;
    PV.Inv.pay(next.cost, null);
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
    else if (a === 'buy') buy(el.dataset.k, +el.dataset.n);
    else if (a === 'up') upgrade(el.dataset.k);
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
        <td>${Port.sellPrice(isl, k)} 💰</td>
        <td><button data-act="sell" data-k="${k}" data-n="1" ${have ? '' : 'disabled'}>Vender 1</button><button data-act="sell" data-k="${k}" data-n="9999" ${have ? '' : 'disabled'}>Todo</button></td>
        <td>${Port.buyPrice(isl, k)} 💰</td>
        <td><button data-act="buy" data-k="${k}" data-n="1">Comprar 1</button><button data-act="buy" data-k="${k}" data-n="10">10</button></td>
      </tr>`;
    }).join('');
    return `<p class="muted">Cada puerto paga distinto. Si vendés mucho de algo, el precio baja (y se recupera con el tiempo).</p>
      <table class="market"><tr><th>Recurso</th><th>En bodega</th><th>Te pagan</th><th></th><th>Cuesta</th><th></th></tr>${rows}</table>`;
  }

  function shipyardHtml() {
    const S = PV.state;
    return `<p class="muted">Las mejoras se pagan con doblones y con materiales que tengas en la bodega del barco.</p>` +
      Object.keys(D.UP).map(k => {
        const up = D.UP[k], lv = S.ship.up[k], cur = up.lv[lv], next = up.lv[lv + 1];
        const pips = up.lv.map((_, i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('');
        const right = next
          ? `<div style="text-align:right"><div>→ ${up.fmt(next)}</div><div style="font-size:12px;margin:3px 0">${PV.Inv.costHtml(next.cost, null)}</div>
             <button class="primary" data-act="up" data-k="${k}" ${PV.Inv.canPay(next.cost, null) ? '' : 'disabled'}>Mejorar</button></div>`
          : '<b>Nivel máximo</b>';
        return `<div class="upg"><div class="ic">${up.icon}</div>
          <div><h4>${up.n} <span class="lvl">${pips}</span></h4><div class="sub">${up.desc}: ${up.fmt(cur)}</div></div>${right}</div>`;
      }).join('');
  }

  function repairHtml() {
    const S = PV.state, st = PV.Sea.stats();
    const missing = Math.ceil(st.maxHp - S.ship.hp), cost = Math.ceil(missing * 0.8);
    return `<div class="upg"><div class="ic">🩹</div><div><h4>Reparar casco</h4>
      <div class="sub">Vida: ${Math.ceil(S.ship.hp)} / ${st.maxHp}. Cerca de tus islas el barco también se repara solo, despacio.</div></div>
      <button class="primary" data-act="repair" ${missing ? '' : 'disabled'}>${missing ? 'Reparar (' + cost + ' 💰)' : 'Está como nuevo'}</button></div>`;
  }

  Port.render = function () {
    const el = document.getElementById('portPanel'), S = PV.state, isl = Port.isl;
    if (!isl) return;
    const prev = el.querySelector('.pbody');
    const scroll = prev ? prev.scrollTop : 0;
    const tab = (id, label) => `<button data-act="tab" data-tab="${id}" class="${Port.tab === id ? 'on' : ''}">${label}</button>`;
    const body = Port.tab === 'mercado' ? marketHtml() : Port.tab === 'astillero' ? shipyardHtml() : repairHtml();
    el.innerHTML = `
      <div class="ph"><h2>⚓ ${isl.name}</h2>
        <div>💰 <b>${U.fmt(S.doblones)}</b> · 📦 ${PV.Inv.cargoTotal()}/${PV.Inv.cargoCap()}</div>
        <button class="primary" data-act="close">⛵ Zarpar (Esc)</button></div>
      <div class="tabs">${tab('mercado', '🪙 Mercado')}${tab('astillero', '🔨 Astillero')}${tab('reparar', '🩹 Reparar')}</div>
      <div class="pbody">${body}</div>`;
    el.querySelector('.pbody').scrollTop = scroll;
  };

  PV.Port = Port;
})(window.PV);
