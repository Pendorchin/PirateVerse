// Tripulantes: se contratan en la taberna de los puertos y mejoran tu barco.
// Cada zona tiene su oficio (D.CREW); cuanto más lejos el puerto, mejor el rango (I, II, III).
(function (PV) {
  'use strict';
  const D = PV.D, U = PV.U, Wd = PV.World;
  const Crew = {};
  const ROMAN = ['', 'I', 'II', 'III'];

  Crew.list = () => PV.state.crew || (PV.state.crew = []);
  Crew.slots = function () {
    const sc = PV.Spr.shipClass(PV.state.ship.up);
    return D.CREW_SLOTS + PV.Spr.CLASSES.indexOf(sc.cur);
  };
  // Suma de los bonus de un tipo (cap, reveal, food, repair, dmg).
  Crew.bonus = function (stat) {
    const S = PV.state;
    if (!S || !S.crew) return 0;
    let t = 0;
    for (const c of S.crew) { const C = D.CREW[c.z]; if (C && C.stat === stat) t += C.v[c.r]; }
    return t;
  };

  // Cada semana la taberna de un puerto tiene 2 candidatos nuevos de su zona.
  function offers(isl) {
    const wk = Math.floor((PV.Colony.dayN() - 1) / 7);
    if (!isl.crewOffer || isl.crewOffer.wk !== wk) {
      const z = Wd.zoneAt(isl.x, isl.y), r = PV.Port.far(isl), names = D.CREW[z].names.slice();
      const taken = new Set(Crew.list().map(c => c.name));
      const list = [];
      for (let i = 0; i < 2; i++) {
        const free = names.filter(n => !taken.has(n));
        const name = free.length ? free[Math.floor(Math.random() * free.length)] : names[0];
        taken.add(name);
        list.push({ z, r, name });
      }
      isl.crewOffer = { wk, list };
    }
    return isl.crewOffer.list;
  }

  Crew.hire = function (isl, i) {
    const S = PV.state, o = offers(isl)[i];
    if (!o) return;
    if (Crew.list().length >= Crew.slots()) return PV.UI.toast('No hay más lugar en tu barco: despedí a alguien o agrandá el barco.', 'bad');
    const p = D.CREW_PRICE[o.r];
    if (S.doblones < p) return PV.UI.toast('No te alcanzan los doblones.', 'bad');
    S.doblones -= p;
    Crew.list().push(o);
    isl.crewOffer.list.splice(i, 1);
    PV.UI.toast(`${D.CREW[o.z].icon} ¡${o.name} se sumó a tu tripulación!`, 'good');
  };

  Crew.fire = function (i) {
    const c = Crew.list()[i];
    if (!c) return;
    Crew.list().splice(i, 1);
    PV.UI.toast(`${c.name} bajó del barco.`);
  };

  // Al anochecer cobran el sueldo. Si no alcanza, el que no cobra se va.
  Crew.payday = function () {
    const S = PV.state, list = Crew.list();
    const left = [];
    for (const c of list.slice()) {
      const w = D.CREW_WAGE[c.r];
      if (S.doblones >= w) S.doblones -= w;
      else { list.splice(list.indexOf(c), 1); left.push(c.name); }
    }
    if (left.length) PV.UI.toast(`💸 No te alcanzó para los sueldos: ${left.join(', ')} se ${left.length > 1 ? 'fueron' : 'fue'} del barco.`, 'bad');
  };

  const desc = c => D.CREW[c.z].d(D.CREW[c.z].v[c.r]);
  const card = (c, btn) => `<div class="upg"><div class="ic">${D.CREW[c.z].icon}</div>
    <div><h4>${c.name} <small class="muted">· ${D.CREW[c.z].n} ${ROMAN[c.r]} · ${D.ZONES[c.z].n}</small></h4>
    <div class="sub">${desc(c)} · sueldo ${D.CREW_WAGE[c.r]} <i class="coin"></i> por día</div></div>${btn}</div>`;

  Crew.html = function (isl) {
    const S = PV.state, list = Crew.list(), full = list.length >= Crew.slots();
    const offer = offers(isl).map((o, i) => card(o, `<button class="primary" data-act="hire" data-i="${i}" ${!full && S.doblones >= D.CREW_PRICE[o.r] ? '' : 'disabled'}>Contratar (${U.fmt(D.CREW_PRICE[o.r])} <i class="coin"></i>)</button>`)).join('')
      || '<p class="muted">No queda nadie buscando barco esta semana. Volvé la semana que viene.</p>';
    const mine = list.map((c, i) => card(c, `<button data-act="fire" data-i="${i}">Despedir</button>`)).join('')
      || '<p class="muted">Todavía no contrataste a nadie.</p>';
    const wages = list.reduce((t, c) => t + D.CREW_WAGE[c.r], 0);
    return `<p class="muted">Cada mar tiene su gente: grumetes en Aguas Mansas, vigías en las Brumas, cocineros en las Especias, carpinteros en los Arrecifes y artilleros en el Mar de Ceniza. <b>Cuanto más lejos el puerto, mejores son.</b> Cobran al anochecer; si no les pagás, se van.</p>
      <h3 style="margin:8px 0 4px">🍺 Buscan barco</h3>${offer}
      <h3 style="margin:12px 0 4px">🧑‍✈️ Tu tripulación (${list.length}/${Crew.slots()})${wages ? ` · ${wages} <i class="coin"></i> por día` : ''}</h3>${mine}
      <p class="muted">Con un barco más grande (bergantín, galeón) entra más gente.</p>`;
  };

  PV.Crew = Crew;
})(window.PV);
