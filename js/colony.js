// Vida en la colonia: día y noche, comida, ron, tabernas, moral y huelgas. También la tripulación del barco.
// Cada isla tiene isl.col = { mor (moral 0..1), mul (ritmo de trabajo del día), fed, ron, rest, strike }.
// Al caer la noche los trabajadores dejan de trabajar y van a la taberna: ahí comen y toman ron.
// Lo que consiguieron esa noche decide cómo trabajan al día siguiente.
(function (PV) {
  'use strict';
  const D = PV.D, U = PV.U, C = D.COLONY;
  const Col = {};

  // ---------- Reloj ----------
  Col.phase = () => (PV.state.time || 0) % C.day;               // segundos desde que amaneció
  Col.dayN = () => Math.floor((PV.state.time || 0) / C.day) + 1;
  Col.isNight = () => Col.phase() >= C.day - C.night;
  Col.toNight = () => C.day - C.night - Col.phase();             // < 0 si ya es de noche
  Col.toDay = () => C.day - Col.phase();
  // Oscuridad 0..1 con atardecer y amanecer suaves.
  Col.dark = function () {
    const p = Col.phase(), n0 = C.day - C.night, f = C.fade;
    if (p < n0 - f) return p < f ? 1 - p / f : 0;               // amanecer al principio del día
    if (p < n0) return (p - (n0 - f)) / f;                       // atardecer
    return 1;
  };

  // ---------- Trabajadores ----------
  Col.st = function (isl) {
    const c = isl.col || (isl.col = { mor: 1, mul: 1, fed: 1, ron: 1, rest: 1, strike: false });
    // Partidas con un error viejo guardaron números rotos (null): se arreglan solos.
    for (const k of ['mor', 'mul', 'fed', 'ron', 'rest']) if (!Number.isFinite(c[k])) c[k] = 1;
    return c;
  };
  Col.crewOf = b => (C.crew[D.base(b.type)] || 0) * (D.BUILD[b.type].of ? 2 : 1);
  Col.isWorker = b => !!C.crew[D.base(b.type)];
  Col.isFood = b => C.food.includes(D.base(b.type));
  Col.workers = isl => isl.buildings.reduce((t, b) => t + (b.broken ? 0 : Col.crewOf(b)), 0);
  Col.taverns = isl => isl.buildings.filter(b => b.type === 'taberna' && !b.broken);
  Col.seats = isl => Col.taverns(isl).length * C.seats;

  // Ritmo de trabajo de un edificio ahora (0 = parado). Los que no tienen trabajadores siempre van a 1.
  Col.work = function (isl, b) {
    if (!Col.isWorker(b)) return 1;
    if (Col.isNight()) return 0;
    const c = Col.st(isl);
    if (c.strike && !Col.isFood(b)) return 0;
    return c.mul;
  };

  // Saca n de un recurso: primero de las tabernas, después del almacén.
  function take(isl, k, n) {
    let got = 0;
    for (const t of Col.taverns(isl)) {
      const m = Math.min(n - got, t.inv[k] || 0);
      if (m > 0) { PV.Inv.add(t.inv, k, -m); got += m; }
    }
    const m = Math.min(n - got, isl.storage[k] || 0);
    if (m > 0) { PV.Inv.add(isl.storage, k, -m); got += m; }
    return got;
  }

  // La cena de una isla. Devuelve un resumen para avisar si algo faltó.
  function supper(isl) {
    const c = Col.st(isl), w = Col.workers(isl);
    if (!w) return null;
    const needR = w, needRon = Math.ceil(w * C.ronPer);
    const gotR = take(isl, 'raciones', needR), plain = take(isl, 'ron', needRon), fine = take(isl, 'ron_anejo', needRon - plain), gotRon = plain + fine;
    c.fed = gotR / needR;
    c.ron = gotRon / needRon;
    c.rest = Math.min(1, Col.seats(isl) / w);
    c.mul = (0.5 + 0.5 * c.fed) * (0.7 + 0.3 * c.rest);
    const was = c.strike;
    c.mor = U.clamp(c.mor + 0.15 * c.ron + C.anejo * fine / needRon - 0.25 * (1 - c.ron) - (c.fed < 0.5 ? 0.1 : 0), 0, 1);
    // Para salir de una huelga hace falta que la moral suba un poco más (así no entra y sale cada noche).
    c.strike = c.mor < C.strike || (was && c.mor < C.strike + 0.1);
    return { isl, w, gotR, needR, gotRon, needRon, strike: c.strike, was };
  }

  // Tu tripulación también come y toma ron. Si estás en una isla tuya, comen de ahí.
  function crewSupper() {
    const S = PV.state, sh = S.ship, cargo = sh.cargo, isl = PV.scene === 'island' && PV.Island.cur;
    if (sh.mor === undefined) sh.mor = 1;
    const eat = (k, n) => {
      let got = Math.min(n, cargo[k] || 0);
      PV.Inv.add(cargo, k, -got);
      if (got < n && isl) got += take(isl, k, n - got);
      return got;
    };
    const r = eat('raciones', C.ship.raciones), plain = eat('ron', C.ship.ron), fine = eat('ron_anejo', C.ship.ron - plain), ron = plain + fine;
    sh.hungry = r < C.ship.raciones;
    sh.mor = U.clamp(sh.mor + (ron >= C.ship.ron ? 0.15 + (fine ? C.anejo : 0) : -0.25), 0, 1);
    if (sh.hungry) PV.UI.toast('🍖 Tu tripulación se quedó sin raciones: mañana el barco va más lento. Llevá raciones en la bodega.', 'bad');
    if (ron < C.ship.ron && sh.mor > 0) PV.UI.toast(`🍺 Tu tripulación se quedó sin ron: la moral baja (${Math.round(sh.mor * 100)}%).`, 'bad');
    if (sh.mor <= 0) {
      const lost = Math.floor(S.doblones * 0.25);
      S.doblones -= lost;
      sh.mor = 0.5;
      PV.UI.toast(`☠️ ¡Motín a bordo! La tripulación se llevó ${U.fmt(lost)} doblones. Que no les falte el ron.`, 'bad');
    }
  }

  // Velocidad del barco según cómo está la tripulación.
  Col.shipMul = function () {
    const sh = PV.state.ship;
    return (sh.hungry ? 0.75 : 1) * ((sh.mor === undefined ? 1 : sh.mor) < 0.3 ? 0.85 : 1);
  };

  Col.update = function () {
    const S = PV.state;
    if (!S || !Col.isNight()) return;
    const day = Col.dayN();
    if (S.mealDay === day) return;
    S.mealDay = day;
    const res = PV.state.islands.filter(i => i.owned && i.buildings && i.buildings.length).map(supper).filter(Boolean);
    PV.UI.toast('🌙 Anochece: tu gente deja el trabajo y va a la taberna a comer y tomar ron.');
    for (const r of res) {
      const n = r.isl.name;
      if (r.strike && !r.was) PV.UI.toast(`✊ ¡Huelga en ${n}! Sin ron la moral se fue al piso: solo trabajan los que hacen comida hasta que les lleves ron.`, 'bad');
      else if (!r.strike && r.was) PV.UI.toast(`🍺 Se terminó la huelga en ${n}. ¡A trabajar!`, 'good');
      else if (r.gotR < r.needR) PV.UI.toast(`🍖 En ${n} faltó comida (${r.gotR}/${r.needR} raciones): mañana trabajan más lento.`, 'bad');
      else if (r.gotRon < r.needRon) PV.UI.toast(`🍺 En ${n} faltó ron (${r.gotRon}/${r.needRon}): la moral baja.`, 'bad');
    }
    crewSupper();
  };

  // ---------- Textos para la interfaz ----------
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  Col.clock = function () {
    return Col.isNight() ? `🌙 Noche del día ${Col.dayN()} · amanece en ${mmss(Col.toDay())}`
      : `☀️ Día ${Col.dayN()} · anochece en ${mmss(Col.toNight())}`;
  };

  Col.islandLine = function (isl) {
    const w = Col.workers(isl);
    if (!w) return '';
    const c = Col.st(isl), have = k => (isl.storage[k] || 0) + Col.taverns(isl).reduce((t, b) => t + (b.inv[k] || 0), 0) + (k === 'ron' ? have('ron_anejo') : 0);
    const pct = v => Math.round(v * 100) + '%';
    const mc = c.mor < 0.35 ? '#c0392b' : c.mor < 0.65 ? '#b9770e' : '#1e8449';
    return `<div class="lbl colony">👷 ${w} trabajadores · 🍖 ${have('raciones')}/${w} · 🍺 ${have('ron')}/${Math.ceil(w * C.ronPer)} por noche<br>
      Moral <b style="color:${mc}">${pct(c.mor)}</b> · Ritmo <b>${c.strike ? '✊ huelga' : pct(c.mul)}</b> · 🍺 Tabernas: ${Col.seats(isl)}/${w} lugares</div>`;
  };

  Col.crewLine = function () {
    const sh = PV.state.ship, cg = sh.cargo, m = sh.mor === undefined ? 1 : sh.mor;
    const ron = (cg.ron || 0) + (cg.ron_anejo || 0), warn = (cg.raciones || 0) < C.ship.raciones || ron < C.ship.ron;
    return `<div class="lbl ${warn ? 'warn' : ''}">🧑‍✈️ Tripulación: 🍖 ${cg.raciones || 0} · 🍺 ${ron} (gasta ${C.ship.raciones} y ${C.ship.ron} por día) · moral ${Math.round(m * 100)}%${sh.hungry ? ' · <b>con hambre</b>' : ''}</div>`;
  };

  // ---------- Noche en pantalla ----------
  // lights: [[x, y, radio]] en coordenadas de pantalla.
  let cv = null;
  Col.drawNight = function (ctx, lights) {
    const a = Col.dark() * 0.62;
    if (a <= 0.01) return;
    const W = PV.W, H = PV.H, dpr = PV.dpr;
    if (!cv) cv = document.createElement('canvas');
    if (cv.width !== Math.floor(W * dpr) || cv.height !== Math.floor(H * dpr)) { cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    c.fillStyle = `rgba(8,14,40,${a})`;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-out';
    const fl = 0.92 + Math.sin(PV.time * 7) * 0.04;
    for (const [x, y, r] of lights) {
      const g = c.createRadialGradient(x, y, 0, x, y, r * fl);
      g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.5, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r * fl, 0, Math.PI * 2); c.fill();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, 0, 0);
    // Un poco de luz cálida sobre los faroles.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r] of lights) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.6);
      g.addColorStop(0, `rgba(255,170,60,${0.22 * Col.dark()})`); g.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  // Partida nueva: provisiones para arrancar.
  Col.startStock = function (S) {
    for (const k in C.start) PV.Inv.add(S.islands[0].storage, k, C.start[k]);
    for (const k in C.shipStart) PV.Inv.add(S.ship.cargo, k, C.shipStart[k]);
    S.ship.mor = 1;
  };

  PV.Colony = Col;
})(window.PV);
