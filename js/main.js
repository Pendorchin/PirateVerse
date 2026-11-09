// Arranque del juego, estado inicial y bucle principal.
(function (PV) {
  'use strict';
  const canvas = document.getElementById('game');
  PV.ctx = canvas.getContext('2d');
  PV.scene = 'menu';

  function resize() {
    PV.dpr = window.devicePixelRatio || 1;
    PV.W = window.innerWidth;
    PV.H = window.innerHeight;
    canvas.width = Math.floor(PV.W * PV.dpr);
    canvas.height = Math.floor(PV.H * PV.dpr);
    canvas.style.width = PV.W + 'px';
    canvas.style.height = PV.H + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  PV.setScene = function (s) {
    if (PV.scene === 'menu') PV.Tutorial.reset();
    PV.scene = s;
    PV.UI.onScene(s);
  };

  function createState(seed, diff) {
    const islands = PV.World.generate(seed);
    const home = islands[0];
    return {
      v: 1, zonesV: 1, seed, diff: diff || 'normal', doblones: 400, nextId: 1, time: 0, islands,
      ship: { x: home.x + home.R + 140, y: home.y, a: 0, v: 0, hp: 100, up: { bodega: 0, casco: 0, canones: 0, velas: 0 }, cargo: {} },
      fog: new Array(PV.World.FOG_N * PV.World.FOG_N).fill(0),
      fleet: [],
    };
  }

  PV.newGame = function (diff, tut) {
    PV.state = createState((Math.random() * 1e9) >>> 0, diff);
    PV.state.tutOff = tut === false;
    PV.Colony.startStock(PV.state);
    PV.Tech.reset();
    PV.Island.ensureGrid(PV.state.islands[0]);
    PV.Sea.init();
    PV.setScene('sea');
    PV.Save.save();
    if (tut !== false) return;
    PV.UI.toast('¡Bienvenido, capitán! Acercate a Isla Refugio y apretá F para desembarcar.', 'good');
    setTimeout(() => PV.UI.toast('Poné leñadores en los árboles y minas en las piedras, y trazá senderos hasta un almacén: tus porteadores llevan la carga.'), 4000);
    setTimeout(() => PV.UI.toast('Vendé en los puertos ⚓ y mejorá tu barco para llegar a islas más raras.'), 8000);
  };

  PV.continueGame = function () {
    const s = PV.Save.load();
    if (!s) return;
    PV.state = s;
    if (!s.diff) s.diff = 'normal';
    PV.Tech.reset();
    PV.Tech.migrate();
    // Partidas viejas: se suman los puertos de las zonas nuevas y cada puerto toma los precios de su zona.
    const r = PV.U.rng((s.seed ^ 0x5a17c0de) >>> 0);
    if (!s.zonesV) {
      const n = PV.World.addPorts(s.islands, r);
      for (let i = s.fog.length; i < PV.World.FOG_N * PV.World.FOG_N; i++) s.fog.push(0);
      s.zonesV = 1;
      if (n) setTimeout(() => PV.UI.toast(`🧭 El mar ahora tiene zonas y se abrieron ${n} puertos nuevos. Cada zona vende lo suyo y paga bien lo que le falta.`, 'good'), 1500);
    }
    for (const isl of s.islands) {
      if (isl.grid) { PV.Island.migrate(isl); PV.Island.rebuildOcc(isl); }
      if (isl.port && !isl.zone) PV.World.setupMarket(isl, r);
      if (isl.port) for (const k in PV.D.RES) if (!isl.market[k]) isl.market[k] = { m: 1, f: 1 };
    }
    PV.Sea.init();
    PV.Raid.restore();
    PV.setScene('sea');
    PV.UI.toast('Partida cargada.', 'good');
  };

  PV.onKey = function (code) {
    if (PV.UI.researchOpen() && (code === 'Escape' || code === 'KeyI')) return PV.UI.closeResearch();
    if (PV.UI.bankOpen() && code === 'Escape') return PV.UI.closeBank();
    if (code === 'KeyI' && (PV.scene === 'sea' || PV.scene === 'island')) return PV.UI.openResearch();
    if (PV.scene === 'sea') PV.Sea.onKey(code);
    else if (PV.scene === 'island') PV.Island.onKey(code);
    else if (PV.scene === 'port' && code === 'Escape') PV.Port.close();
  };

  PV.onMouse = function (type, e) {
    if (PV.scene === 'island') PV.Island.onMouse(type, e);
    else if (PV.scene === 'sea' && type === 'wheel') PV.Sea.zoomBy(e.deltaY);
  };

  window.addEventListener('beforeunload', () => { PV.Save.save(); PV.Cloud.flush(); });

  let last = performance.now(), saveT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    PV.time += dt;
    const ctx = PV.ctx;
    ctx.setTransform(PV.dpr, 0, 0, PV.dpr, 0, 0);

    if (PV.scene === 'menu') {
      PV.Sea.drawBackdrop(ctx);
    } else {
      PV.state.time += dt;
      PV.Island.updateAll(dt);
      PV.Port.update(dt);
      PV.Fleet.update(dt);
      PV.Fleet.updateCoast(dt);
      PV.Bank.update(dt);
      PV.Colony.update(dt);
      PV.Raid.update(dt);
      if (PV.scene === 'sea') PV.Sea.update(dt);
      if (PV.scene === 'island') { PV.Island.update(dt); PV.Island.render(ctx); }
      else PV.Sea.render(ctx);
      saveT += dt;
      if (saveT > 30) { saveT = 0; PV.Save.save(); }
    }
    PV.UI.update(dt);
    requestAnimationFrame(frame);
  }

  PV.UI.init();
  PV.Transfer.init();
  PV.Cloud.init();
  PV.UI.onScene('menu');
  requestAnimationFrame(frame);
})(window.PV);
