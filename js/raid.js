// Asaltos piratas a tus islas: aviso, flota que llega por mar, asedio, saqueo (o conquista en Difícil).
// Estado guardado en PV.state.raid = { next, cur: { isl, phase: 'warn' | 'siege', t, siege, ships, tier } }.
// Los barcos atacantes viven en PV.Sea.enemies con raid: true y home = la isla atacada.
(function (PV) {
  'use strict';
  const D = PV.D, U = PV.U, R = D.RAID;
  const TAU = Math.PI * 2;
  const Raid = {};

  // Los asaltos llegan una vez por semana, al amanecer (días 8, 15, 22…).
  const WEEK = () => R.week * D.COLONY.day;
  Raid.toNext = () => WEEK() - ((PV.state.time || 0) % WEEK());
  Raid.nextDay = () => Math.floor(((PV.state.time || 0) + Raid.toNext()) / D.COLONY.day) + 1;

  Raid.st = function () {
    const S = PV.state;
    if (!S.raid) S.raid = { next: Raid.toNext(), cur: null, weekly: 1 };
    // Partidas de antes: pasan al calendario semanal.
    if (!S.raid.weekly) { S.raid.weekly = 1; if (!S.raid.cur) S.raid.next = Raid.toNext(); }
    return S.raid;
  };

  const owned = () => PV.state.islands.filter(i => i.owned);
  const count = (isl, type) => (isl.buildings || []).filter(b => b.type === type && !b.broken).length;
  Raid.ships = () => PV.Sea.enemies.filter(e => e.raid);
  Raid.watched = isl => count(isl, 'torre_vigia') > 0;
  Raid.wealth = () => PV.state.doblones + PV.Bank.total() + owned().reduce((t, i) => t + PV.Inv.storageTotal(i) * 5, 0);

  // Cuánto reducen el saqueo las defensas de la isla (0 = nada, 1 = todo).
  Raid.protection = function (isl) {
    const walls = Math.min(R.wallMax, count(isl, 'empalizada') * R.wall);
    const bar = Math.min(R.barracksMax, count(isl, 'cuartel') * R.barracks);
    return 1 - (1 - walls) * (1 - bar);
  };

  // Tiempo hasta el próximo asalto: el amanecer de la semana que viene.
  function interval() {
    return Raid.toNext() < 30 ? Raid.toNext() + WEEK() : Raid.toNext();
  }

  // Elige la isla: las más ricas y pobladas atraen más piratas.
  function pickTarget() {
    const list = owned().filter(i => (i.buildings || []).length >= 3);
    if (!list.length) return null;
    const w = list.map(i => 1 + i.buildings.length + PV.Inv.storageTotal(i) / 50 + (i.bank ? i.bank.saved / 500 : 0));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < list.length; k++) if ((r -= w[k]) <= 0) return list[k];
    return list[0];
  }

  Raid.start = function (isl) {
    const st = Raid.st(), o = owned().length, wealth = Raid.wealth();
    isl = isl || pickTarget();
    if (!isl) return false;
    const ships = U.clamp(2 + Math.floor((o - 1) / 2) + (wealth > 4000) + (wealth > 15000) + (isl.tier >= 3), 1, 7);
    const tier = U.clamp(1 + Math.floor((o - 1) / 2) + (isl.tier >= 3 ? 1 : 0), 1, 5);
    const warn = R.warn + (Raid.watched(isl) ? R.watch : 0);
    st.cur = { isl: isl.id, phase: 'warn', t: warn, siege: R.siege, ships, tier };
    PV.UI.toast(`⚠️ ¡${ships === 1 ? 'Un barco pirata se acerca' : ships + ' barcos piratas se acercan'} a ${isl.name}! Llegan en ${Math.round(warn)} s.`, 'bad');
    return true;
  };

  function spawnFleet(cur) {
    const isl = PV.state.islands[cur.isl], a0 = Math.random() * TAU;
    for (let i = 0; i < cur.ships; i++) {
      const a = a0 + (i - (cur.ships - 1) / 2) * 0.25, d = isl.R + 900;
      PV.Sea.spawnRaider(isl, isl.x + Math.cos(a) * d, isl.y + Math.sin(a) * d, cur.tier, a + Math.PI);
    }
  }

  // Partida cargada en medio de un asedio: los barcos vuelven a aparecer cerca.
  Raid.restore = function () {
    const cur = Raid.st().cur;
    if (cur && cur.phase === 'siege' && !Raid.ships().length) spawnFleet(cur);
  };

  // Barcos atacantes que llegaron a la isla (están asediando).
  Raid.arrived = function () {
    const cur = Raid.st().cur;
    if (!cur) return [];
    const isl = PV.state.islands[cur.isl];
    return Raid.ships().filter(e => U.dist(e.x, e.y, isl.x, isl.y) < isl.R + 320);
  };

  Raid.update = function (dt) {
    const S = PV.state;
    if (!S) return;
    const st = Raid.st(), cur = st.cur;
    if (!cur) {
      st.next -= dt;
      // Si todavía no hay ninguna isla que valga la pena, esa semana no vienen.
      if (st.next <= 0) { Raid.start(); st.next = interval(); }
      return;
    }
    const isl = S.islands[cur.isl];
    if (cur.phase === 'warn') {
      cur.t -= dt;
      if (cur.t <= 0) { cur.phase = 'siege'; spawnFleet(cur); }
      return;
    }
    // Fuera del mar los barcos se siguen moviendo (en el mar los mueve PV.Sea).
    if (PV.scene !== 'sea') for (const e of Raid.ships()) moveOffscreen(e, isl, dt);
    updateBatteries(isl, dt);
    if (!Raid.ships().length) return win(isl, cur);
    if (Raid.arrived().length) {
      cur.siege -= dt;
      if (cur.siege <= 0) lose(isl, cur);
    }
  };

  function moveOffscreen(e, isl, dt) {
    e.pa = (e.pa || 0) + dt * 0.12;
    const pr = isl.R + 190;
    const want = Math.atan2(isl.y + Math.sin(e.pa) * pr - e.y, isl.x + Math.cos(e.pa) * pr - e.x);
    e.a += U.clamp(U.angDiff(want, e.a), -1.2 * dt, 1.2 * dt);
    e.v = U.lerp(e.v, e.speed * 0.6, dt);
    e.x += Math.cos(e.a) * e.v * dt; e.y += Math.sin(e.a) * e.v * dt;
  }

  // Baterías de la isla: disparan al barco atacante más cercano y gastan la mejor munición.
  function updateBatteries(isl, dt) {
    const B = R.battery;
    for (const b of isl.buildings) {
      if (b.type !== 'bateria' || b.broken) continue;
      b.cd = (b.cd || 0) - dt;
      if (b.cd > 0) continue;
      const [x, y] = Raid.batteryPos(isl, b);
      let best = null, bd = B.range;
      for (const e of Raid.ships()) { const d = U.dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      if (!best) continue;
      b.cd = B.cd;
      const k = Object.keys(B.ammo).find(a => (b.ammo || {})[a] > 0);
      const dmg = k ? B.ammo[k] : B.dmg;
      if (k) PV.Inv.add(b.ammo, k, -1);
      PV.Sea.batteryShot(x, y, best, dmg);
    }
  }

  Raid.batteryPos = function (isl, b) {
    const def = D.BUILD[b.type];
    return PV.World.tileToWorld(isl, b.x + def.w / 2, b.y + def.h / 2);
  };

  function endRaid(cur) {
    Raid.st().cur = null;
    Raid.st().next = interval();
    // Los que quedan se van.
    for (const e of Raid.ships()) PV.Sea.enemies.splice(PV.Sea.enemies.indexOf(e), 1);
  }

  function win(isl, cur) {
    const prize = 40 * cur.ships * cur.tier;
    PV.state.doblones += prize;
    PV.state.raidsWon = (PV.state.raidsWon || 0) + 1;
    PV.UI.toast(`🏆 ¡Rechazaste el asalto a ${isl.name}! Botín de los piratas: ${prize} doblones.`, 'good');
    endRaid(cur);
  }

  function lose(isl, cur) {
    const S = PV.state, Inv = PV.Inv;
    const frac = R.loot * (1 - Raid.protection(isl));
    let stolen = 0;
    for (const k of Object.keys(isl.storage)) {
      const n = Math.floor(isl.storage[k] * frac);
      if (n) { Inv.add(isl.storage, k, -n); stolen += n; }
    }
    let gold = 0;
    if (isl.bank && isl.bank.saved > 0) {
      gold = Math.floor(isl.bank.saved * frac / PV.Tech.fx('vault') / (PV.Bank.big(isl) ? 2 : 1));
      isl.bank.saved -= gold;
    }
    // Rompen algunos edificios; cada 8 tramos de empalizada salvan uno.
    const nBreak = Math.max(0, 1 + Math.floor(cur.ships / 2) - Math.floor(count(isl, 'empalizada') / 8));
    const cand = U.shuffle(Math.random, isl.buildings.filter(b => !b.broken && b.type !== 'cinta' && b.type !== 'empalizada'));
    const broken = cand.slice(0, nBreak);
    for (const b of broken) b.broken = true;

    const hard = S.diff === 'dificil' && !isl.home;
    let msg = `🏴‍☠️ Los piratas saquearon ${isl.name}: ${stolen} recursos` + (gold ? `, ${U.fmt(gold)} doblones del banco` : '') +
      (broken.length ? ` y rompieron ${broken.length} edificio${broken.length > 1 ? 's' : ''}` : '') + '.';
    if (hard) {
      capture(isl, cur);
      msg = `🏴‍☠️ ¡Los piratas tomaron ${isl.name}! Destruí sus defensas y volvé a fundar el fuerte para recuperarla.`;
    }
    PV.UI.toast(msg, 'bad');
    if (!hard) endRaid(cur);
    else { Raid.st().cur = null; Raid.st().next = interval(); }
    if (PV.Island.cur === isl && hard) PV.Island.leave();
  }

  // Modo difícil: la isla vuelve a ser enemiga. Los atacantes se quedan como guardianes y aparecen torres.
  function capture(isl, cur) {
    isl.owned = false;
    isl.storage = {};
    for (const e of Raid.ships()) { e.raid = false; e.aggro = false; }
    const nt = Math.max(1, D.TIERS[isl.tier].towers);
    isl.towers = [];
    const off = Math.random() * TAU;
    for (let i = 0; i < nt; i++) {
      const a = off + (i / nt) * TAU, rr = PV.World.radius(isl, a) * 0.9, hp = PV.World.towerHp(cur.tier);
      isl.towers.push({ x: isl.x + Math.cos(a) * rr, y: isl.y + Math.sin(a) * rr, hp, max: hp, cd: 2 });
    }
  }

  // Un barco atacante hundido.
  Raid.onKill = function (e) {
    const cur = Raid.st().cur;
    if (cur && !Raid.ships().length) win(PV.state.islands[cur.isl], cur);
  };

  // Texto para el cartel de arriba.
  Raid.banner = function () {
    const S = PV.state;
    if (!S) return '';
    const cur = Raid.st().cur;
    if (!cur) return '';
    const isl = S.islands[cur.isl], mm = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (cur.phase === 'warn') return `⚠️ Piratas rumbo a <b>${isl.name}</b> · llegan en ${mm(cur.t)}`;
    const n = Raid.ships().length, a = Raid.arrived().length;
    return `⚔️ Asalto a <b>${isl.name}</b> · ${n} barco${n === 1 ? '' : 's'} · ` +
      (a ? `saquean en ${mm(cur.siege)}` : 'acercándose') + ` · protección ${Math.round(Raid.protection(isl) * 100)}%`;
  };

  PV.Raid = Raid;
})(window.PV);
