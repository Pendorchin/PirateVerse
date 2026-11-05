// Vista de isla: grilla de construcción estilo Factorio (extractores, cintas, fábricas).
// La simulación de TODAS las islas propias corre siempre, aunque estés en el mar.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D;
  const T = 32;
  const TAU = Math.PI * 2;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // este, sur, oeste, norte
  const BELT_SPEED = 1.9;  // casillas por segundo
  const GAP = 0.34;        // separación mínima entre objetos en una cinta
  const Isl = { cur: null, sel: null, dir: 0, cam: { x: 0, y: 0, z: 1 }, drag: null, pan: null, hover: null };

  // ---------- Grilla y ocupación ----------

  Isl.ensureGrid = function (isl) {
    if (!isl.grid) isl.grid = PV.World.genGrid(isl, PV.state.seed);
    if (!isl._occ) Isl.rebuildOcc(isl);
  };

  Isl.rebuildOcc = function (isl) {
    const g = isl.grid;
    isl._occ = new Array(g.w * g.h).fill(null);
    isl._nAlm = 0;
    for (const b of isl.buildings) mark(isl, b, b);
  };

  function mark(isl, b, v) {
    const def = D.BUILD[b.type], g = isl.grid;
    for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) isl._occ[(b.y + j) * g.w + b.x + i] = v;
    if (b.type === 'almacen') isl._nAlm += v ? 1 : -1;
  }

  function inside(isl, x, y) { const g = isl.grid; return x >= 0 && y >= 0 && x < g.w && y < g.h; }
  function occAt(isl, x, y) { return inside(isl, x, y) ? isl._occ[y * isl.grid.w + x] : null; }
  function landAt(isl, x, y) { return inside(isl, x, y) ? isl.grid.land[y * isl.grid.w + x] : 0; }

  Isl.canPlace = function (isl, type, x, y) {
    const def = D.BUILD[type], g = isl.grid;
    let res = 0;
    for (let j = 0; j < def.h; j++) {
      for (let i = 0; i < def.w; i++) {
        const tx = x + i, ty = y + j;
        if (!landAt(isl, tx, ty) || occAt(isl, tx, ty)) return false;
        if (g.res[ty * g.w + tx]) res++;
      }
    }
    if (type === 'muelle') return touchesWater(isl, x, y, def);
    return type !== 'extractor' || res > 0;
  };

  function touchesWater(isl, x, y, def) {
    for (let j = -1; j <= def.h; j++) for (let i = -1; i <= def.w; i++) {
      if (!landAt(isl, x + i, y + j)) return true;
    }
    return false;
  }

  function tryPlace(isl, type, x, y, dir, quiet) {
    if (!Isl.canPlace(isl, type, x, y)) {
      if (!quiet) PV.UI.toast(type === 'extractor' ? 'La mina tiene que ir sobre un yacimiento.' : type === 'muelle' ? 'El muelle tiene que tocar el agua.' : 'No se puede construir ahí.', 'bad');
      return null;
    }
    const cost = D.BUILD[type].cost;
    if (!PV.Inv.canPay(cost, isl)) { PV.UI.toast('Te falta: ' + PV.Inv.costHtml(cost, isl).replace(/<[^>]+>/g, ''), 'bad'); return null; }
    PV.Inv.pay(cost, isl);
    const b = { id: PV.state.nextId++, type, x, y, dir };
    if (type === 'cinta') b.items = [];
    else { b.prog = 0; b.out = []; }
    if (type === 'extractor') b.ri = 0;
    if (type === 'fundicion') { b.ore = null; b.oreN = 0; b.fuel = 0; }
    if (type === 'aserradero') b.n = 0;
    if (type === 'clasificador') { b.filter = null; b.hold = null; }
    if (type === 'insertador') { b.filter = null; b.hand = null; }
    if (D.RECIPES[type]) { b.recipe = Object.keys(D.RECIPES[type])[0]; b.inv = {}; }
    if (type === 'muelle') { b.store = {}; b.unload = []; }
    isl.buildings.push(b);
    mark(isl, b, b);
    return b;
  }

  function removeB(isl, b) {
    mark(isl, b, null);
    isl.buildings.splice(isl.buildings.indexOf(b), 1);
    PV.Inv.refund(D.BUILD[b.type].cost, isl, 0.5);
    const back = [];
    if (b.items) for (const it of b.items) back.push(it.t);
    if (b.out) back.push(...b.out);
    for (let i = 0; i < (b.oreN || 0); i++) back.push(b.ore);
    for (let i = 0; i < (b.n || 0); i++) back.push('madera');
    if (b.hold) back.push(b.hold);
    if (b.hand) back.push(b.hand);
    for (const k of back) PV.Inv.add(isl.storage, k, 1);
    for (const bag of [b.inv, b.store]) if (bag) for (const k in bag) PV.Inv.add(isl.storage, k, bag[k]);
  }

  function removeAt(isl, x, y) {
    const b = occAt(isl, x, y);
    if (b) removeB(isl, b);
  }

  // ---------- Simulación ----------

  function frontTile(b) {
    const def = D.BUILD[b.type], [dx, dy] = DIRS[b.dir];
    if (def.w === 1) return [b.x + dx, b.y + dy];
    const half = (def.w - 1) / 2;
    return [b.x + half + dx * (half + 1), b.y + half + dy * (half + 1)];
  }

  function beltInsert(belt, item, dry) {
    const last = belt.items[belt.items.length - 1];
    if (last && last.p < GAP) return false;
    if (!dry) belt.items.push({ t: item, p: 0 });
    return true;
  }

  // ¿El edificio b recibe este objeto? Con dry solo pregunta, sin guardarlo.
  function accept(isl, b, item, dry) {
    switch (b.type) {
      case 'almacen':
        if (PV.Inv.storageTotal(isl) >= PV.Inv.storageCap(isl)) return false;
        if (!dry) PV.Inv.add(isl.storage, item, 1);
        return true;
      case 'fundicion':
        if (D.SMELT[item] && (b.oreN === 0 || b.ore === item) && b.oreN < 10) { if (!dry) { b.ore = item; b.oreN++; } return true; }
        if (D.FUEL[item] && b.fuel < 6) { if (!dry) b.fuel += D.FUEL[item]; return true; }
        return false;
      case 'aserradero':
        if (item === 'madera' && b.n < 10) { if (!dry) b.n++; return true; }
        return false;
      case 'clasificador':
        if (b.hold) return false;
        if (!dry) b.hold = item;
        return true;
      case 'herreria': case 'taller': {
        const need = D.RECIPES[b.type][b.recipe].in[item];
        if (!need || (b.inv[item] || 0) >= need * 3) return false;
        if (!dry) PV.Inv.add(b.inv, item, 1);
        return true;
      }
      case 'muelle':
        if (PV.Inv.sum(b.store) >= D.DOCK_CAP) return false;
        if (!dry) PV.Inv.add(b.store, item, 1);
        return true;
    }
    return false;
  }

  function give(isl, from, x, y, item, dry) {
    const t = occAt(isl, x, y);
    if (!t || t === from) return false;
    return t.type === 'cinta' ? beltInsert(t, item, dry) : accept(isl, t, item, dry);
  }

  // El estibador toma de lo que tiene atrás algo que lo de adelante acepte.
  function grab(isl, b, src, fx, fy) {
    const ok = k => (!b.filter || b.filter === k) && give(isl, b, fx, fy, k, true);
    if (src.type === 'cinta') {
      const it = src.items[0];
      if (it && it.p >= 0.7 && ok(it.t)) { src.items.shift(); return it.t; }
    } else if (src.type === 'almacen' || src.type === 'muelle') {
      const bag = src.type === 'almacen' ? isl.storage : src.store;
      for (const k of Object.keys(bag)) if (ok(k)) { PV.Inv.add(bag, k, -1); return k; }
    } else if (src.out && src.out.length && ok(src.out[0])) {
      return src.out.shift();
    }
    return null;
  }

  function pushOut(isl, b) {
    if (!b.out.length) return;
    const [fx, fy] = frontTile(b);
    if (give(isl, b, fx, fy, b.out[0])) b.out.shift();
  }

  function updateBuilding(isl, b, dt) {
    const g = isl.grid;
    switch (b.type) {
      case 'extractor': {
        if (!b.out.length && !b.empty) {
          b.prog += dt * D.EXTRACT_RATE;
          if (b.prog >= 1) {
            b.prog = 0;
            let mined = false;
            for (let k = 0; k < 9; k++) {
              const i = (b.ri + k) % 9;
              const idx = (b.y + Math.floor(i / 3)) * g.w + b.x + (i % 3);
              if (g.res[idx] && g.amt[idx] > 0) {
                b.out.push(g.res[idx]);
                if (--g.amt[idx] <= 0) g.res[idx] = '';
                b.ri = i + 1;
                mined = true;
                break;
              }
            }
            if (!mined) b.empty = true;
          }
        }
        pushOut(isl, b);
        break;
      }
      case 'fundicion':
        b.on = b.out.length < 3 && b.oreN >= 2 && b.fuel >= 1;
        if (b.on) {
          b.prog += dt / 2.5;
          if (b.prog >= 1) {
            b.prog = 0; b.oreN -= 2; b.fuel -= 1;
            b.out.push(D.SMELT[b.ore]);
            if (!b.oreN) b.ore = null;
          }
        }
        pushOut(isl, b);
        break;
      case 'aserradero':
        b.on = b.out.length < 4 && b.n >= 1;
        if (b.on) {
          b.prog += dt / 1.2;
          if (b.prog >= 1) { b.prog = 0; b.n--; b.out.push('tablones', 'tablones'); }
        }
        pushOut(isl, b);
        break;
      case 'clasificador': {
        if (!b.hold) break;
        const pass = !b.filter || b.hold === b.filter;
        for (const d of pass ? [b.dir] : [(b.dir + 1) % 4, (b.dir + 3) % 4]) {
          const [dx, dy] = DIRS[d];
          if (give(isl, b, b.x + dx, b.y + dy, b.hold)) { b.hold = null; break; }
        }
        break;
      }
      case 'insertador': {
        const [dx, dy] = DIRS[b.dir];
        if (!b.hand) {
          const src = occAt(isl, b.x - dx, b.y - dy);
          b.prog = 0;
          if (src && src !== b) b.hand = grab(isl, b, src, b.x + dx, b.y + dy);
        } else {
          b.prog = Math.min(1, b.prog + dt / 0.7);
          if (b.prog >= 1 && give(isl, b, b.x + dx, b.y + dy, b.hand)) { b.hand = null; b.prog = 0; }
        }
        break;
      }
      case 'herreria': case 'taller': {
        const r = D.RECIPES[b.type][b.recipe];
        b.on = b.out.length < 4 && Object.keys(r.in).every(k => (b.inv[k] || 0) >= r.in[k]);
        if (b.on) {
          b.prog += dt / r.t;
          if (b.prog >= 1) {
            b.prog = 0;
            for (const k in r.in) PV.Inv.add(b.inv, k, -r.in[k]);
            for (let i = 0; i < r.n; i++) b.out.push(r.out);
          }
        }
        pushOut(isl, b);
        break;
      }
      case 'cinta': {
        const its = b.items;
        for (let i = 0; i < its.length; i++) {
          const lim = i === 0 ? 1 : its[i - 1].p - GAP;
          its[i].p = Math.min(its[i].p + BELT_SPEED * dt, lim);
        }
        if (its.length && its[0].p >= 1) {
          const [dx, dy] = DIRS[b.dir];
          if (give(isl, b, b.x + dx, b.y + dy, its[0].t)) its.shift();
        }
        break;
      }
    }
  }

  Isl.updateAll = function (dt) {
    for (const isl of PV.state.islands) {
      if (!isl.owned || !isl.grid || !isl.buildings.length) continue;
      if (!isl._occ) Isl.rebuildOcc(isl);
      for (const b of isl.buildings) updateBuilding(isl, b, dt);
    }
  };

  // ---------- Muelles ----------

  Isl.docks = isl => isl.buildings.filter(b => b.type === 'muelle');

  // Pasa la carga de los muelles a una bodega (cargo) con lugar libre "room".
  Isl.takeFromDocks = function (isl, cargo, room) {
    let moved = 0;
    for (const d of Isl.docks(isl)) {
      for (const k of Object.keys(d.store)) {
        const n = Math.min(room - moved, d.store[k]);
        if (n <= 0) return moved;
        PV.Inv.add(d.store, k, -n); PV.Inv.add(cargo, k, n); moved += n;
      }
    }
    return moved;
  };

  // Barco del jugador cerca de la isla: carga lo del muelle y descarga lo marcado.
  Isl.dockSync = function (isl) {
    const Inv = PV.Inv, S = PV.state;
    const loaded = Isl.takeFromDocks(isl, S.ship.cargo, Inv.cargoCap() - Inv.cargoTotal());
    let unloaded = 0;
    const marks = new Set();
    for (const d of Isl.docks(isl)) for (const k of d.unload || []) marks.add(k);
    let free = Inv.storageCap(isl) - Inv.storageTotal(isl);
    for (const k of marks) {
      const n = Math.min(free, S.ship.cargo[k] || 0);
      if (n <= 0) continue;
      Inv.add(S.ship.cargo, k, -n); Inv.add(isl.storage, k, n);
      free -= n; unloaded += n;
    }
    return { loaded, unloaded };
  };

  // ---------- Entrar / salir ----------

  Isl.enter = function (isl) {
    Isl.ensureGrid(isl);
    Isl.cur = isl;
    Isl.sel = null; Isl.drag = null; Isl.pan = null;
    const g = isl.grid;
    Isl.cam.x = (g.w * T) / 2; Isl.cam.y = (g.h * T) / 2;
    Isl.cam.z = U.clamp(Math.min(PV.W / (g.w * T), PV.H / (g.h * T)) * 1.05, 0.5, 1.4);
    PV.state.ship.v = 0;
    PV.setScene('island');
    const r = Isl.dockSync(isl);
    if (r.loaded || r.unloaded) PV.UI.toast(`Muelle: ${r.loaded} cargados al barco, ${r.unloaded} descargados.`, 'good');
  };

  Isl.leave = function () {
    Isl.cur = null; Isl.sel = null; Isl.drag = null;
    PV.setScene('sea');
    PV.Save.save();
  };

  Isl.select = function (type) {
    Isl.sel = Isl.sel === type ? null : type;
  };

  // Mover recursos entre el almacén de la isla y la bodega del barco.
  Isl.transfer = function (toShip) {
    const isl = Isl.cur, S = PV.state, Inv = PV.Inv;
    let moved = 0;
    if (toShip) {
      for (const k of Object.keys(isl.storage)) {
        const n = Inv.addCargo(k, isl.storage[k]);
        Inv.add(isl.storage, k, -n);
        moved += n;
      }
      if (!moved) PV.UI.toast(Inv.cargoTotal() >= Inv.cargoCap() ? 'La bodega está llena.' : 'El almacén está vacío.', 'bad');
    } else {
      let free = Inv.storageCap(isl) - Inv.storageTotal(isl);
      for (const k of Object.keys(S.ship.cargo)) {
        const n = Math.min(free, S.ship.cargo[k]);
        Inv.add(isl.storage, k, n); Inv.add(S.ship.cargo, k, -n);
        free -= n; moved += n;
      }
      if (!moved) PV.UI.toast(Inv.storageCap(isl) ? 'No hay lugar o la bodega está vacía.' : 'Construí un almacén primero.', 'bad');
    }
    if (moved) PV.UI.toast(`Se movieron ${moved} unidades.`, 'good');
  };

  // ---------- Entrada ----------

  function screenToWorld(mx, my) {
    const c = Isl.cam;
    return [(mx - PV.W / 2) / c.z + c.x, (my - PV.H / 2) / c.z + c.y];
  }
  function screenToTile(mx, my) {
    const [wx, wy] = screenToWorld(mx, my);
    return [Math.floor(wx / T), Math.floor(wy / T)];
  }
  function ghostPos(type, tx, ty) {
    const o = Math.floor((D.BUILD[type].w - 1) / 2);
    return [tx - o, ty - o];
  }

  function dragBelt(isl, tx, ty) {
    const d = Isl.drag;
    let [cx, cy] = d.last, guard = 0;
    while ((cx !== tx || cy !== ty) && guard++ < 200) {
      let nx = cx, ny = cy;
      if (Math.abs(tx - cx) >= Math.abs(ty - cy)) nx += Math.sign(tx - cx); else ny += Math.sign(ty - cy);
      const dir = DIRS.findIndex(v => v[0] === nx - cx && v[1] === ny - cy);
      Isl.dir = dir;
      const prev = occAt(isl, cx, cy);
      if (prev && prev.type === 'cinta') prev.dir = dir;
      const ex = occAt(isl, nx, ny);
      if (ex && ex.type === 'cinta') ex.dir = dir;
      else if (!ex) tryPlace(isl, 'cinta', nx, ny, dir, true);
      cx = nx; cy = ny;
    }
    d.last = [tx, ty];
  }

  Isl.onKey = function (code) {
    for (const k in D.BUILD) if (D.BUILD[k].key === code) { Isl.select(k); return; }
    if (code === 'KeyR') {
      const b = Isl.hover && occAt(Isl.cur, Isl.hover[0], Isl.hover[1]);
      if (!Isl.sel && b && b.type !== 'almacen') b.dir = (b.dir + 1) % 4;
      else Isl.dir = (Isl.dir + 1) % 4;
    } else if (code === 'Escape' || code === 'KeyQ') {
      if (Isl.sel) Isl.sel = null; else if (code === 'Escape') Isl.leave();
    }
  };

  Isl.onMouse = function (type, e) {
    const isl = Isl.cur, c = Isl.cam;
    if (!isl) return;
    if (type === 'wheel') {
      const before = screenToWorld(e.clientX, e.clientY);
      c.z = U.clamp(c.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 2.2);
      const after = screenToWorld(e.clientX, e.clientY);
      c.x += before[0] - after[0]; c.y += before[1] - after[1];
      return;
    }
    const [tx, ty] = screenToTile(e.clientX, e.clientY);
    if (type === 'move') {
      Isl.hover = [tx, ty];
      if (Isl.pan) {
        c.x -= (e.clientX - Isl.pan[0]) / c.z; c.y -= (e.clientY - Isl.pan[1]) / c.z;
        Isl.pan = [e.clientX, e.clientY];
      }
      if (Isl.drag) {
        if (Isl.drag.mode === 'belt') dragBelt(isl, tx, ty);
        else removeAt(isl, tx, ty);
      }
    } else if (type === 'down') {
      PV.UI.closeChooser();
      if (e.button === 1) { Isl.pan = [e.clientX, e.clientY]; e.preventDefault(); }
      else if (e.button === 2) { removeAt(isl, tx, ty); Isl.drag = { mode: 'remove' }; }
      else if (e.button === 0 && !Isl.sel) {
        const b = occAt(isl, tx, ty);
        if (b && PV.UI.CHOOSE[b.type]) PV.UI.chooser(b, e.clientX, e.clientY);
      }
      else if (e.button === 0 && Isl.sel) {
        if (Isl.sel === 'cinta') {
          const ex = occAt(isl, tx, ty);
          if (ex && ex.type === 'cinta') ex.dir = Isl.dir;
          else tryPlace(isl, 'cinta', tx, ty, Isl.dir);
          Isl.drag = { mode: 'belt', last: [tx, ty] };
        } else {
          const [x, y] = ghostPos(Isl.sel, tx, ty);
          tryPlace(isl, Isl.sel, x, y, Isl.dir);
        }
      }
    } else if (type === 'up') {
      Isl.drag = null; Isl.pan = null;
    }
  };

  Isl.update = function (dt) {
    const K = PV.Input.keys, c = Isl.cam, s = 700 / c.z * dt;
    if (K.KeyA || K.ArrowLeft) c.x -= s;
    if (K.KeyD || K.ArrowRight) c.x += s;
    if (K.KeyW || K.ArrowUp) c.y -= s;
    if (K.KeyS || K.ArrowDown) c.y += s;
  };

  // ---------- Información (tooltip) ----------

  function resUnder(isl, b) {
    const g = isl.grid, tot = {};
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const idx = (b.y + j) * g.w + b.x + i;
      if (g.res[idx]) tot[g.res[idx]] = (tot[g.res[idx]] || 0) + g.amt[idx];
    }
    return tot;
  }

  const recipeTxt = r => Object.keys(r.in).map(k => r.in[k] + ' ' + D.RES[k].n).join(' + ') + ' → ' + r.n + ' ' + D.RES[r.out].n;
  Isl.recipeTxt = recipeTxt;

  Isl.tooltip = function () {
    const isl = Isl.cur;
    if (!isl || !Isl.hover) return '';
    const [tx, ty] = Isl.hover, g = isl.grid;
    if (!inside(isl, tx, ty)) return '';
    const b = occAt(isl, tx, ty);
    if (b) {
      const def = D.BUILD[b.type];
      let s = `<b>${def.icon} ${def.n}</b><br>`;
      if (b.type === 'extractor') {
        const tot = resUnder(isl, b), keys = Object.keys(tot);
        s += keys.length ? keys.map(k => `${D.RES[k].n}: quedan ${tot[k]}`).join('<br>') : '<span style="color:#e74c3c">Yacimiento agotado</span>';
        if (b.out.length) s += '<br><i>Esperando: poné un sendero o un almacén en la flecha.</i>';
      } else if (b.type === 'fundicion') {
        s += `Mineral: ${b.oreN ? D.RES[b.ore].n + ' ×' + b.oreN : '—'}<br>Combustible: ${b.fuel}`;
        s += b.on ? '<br>🔥 Fundiendo…' : '<br><i>Necesita 2 minerales y combustible (madera o carbón).</i>';
      } else if (b.type === 'aserradero') {
        s += `Madera: ${b.n}` + (b.on ? '<br>🪚 Cortando…' : '<br><i>Mandale madera por un sendero.</i>');
      } else if (b.type === 'almacen') {
        s += `Almacén de la isla: ${PV.Inv.storageTotal(isl)} / ${PV.Inv.storageCap(isl)}`;
      } else if (b.type === 'cinta') {
        s += `Porteadores con carga: ${b.items.length}`;
      } else if (b.type === 'clasificador') {
        s += `Sigue derecho: <b>${b.filter ? D.RES[b.filter].n : 'todo'}</b><br>El resto sale por los costados.<br><i>Clic para elegir.</i>`;
      } else if (b.type === 'insertador') {
        s += `Agarra: <b>${b.filter ? D.RES[b.filter].n : 'cualquier cosa'}</b>` + (b.hand ? `<br>Lleva: ${D.RES[b.hand].n}` : '') + '<br><i>Clic para filtrar.</i>';
      } else if (D.RECIPES[b.type]) {
        const r = D.RECIPES[b.type][b.recipe];
        s += `Receta: <b>${recipeTxt(r)}</b><br>Tiene: ${Object.keys(r.in).map(k => D.RES[k].n + ' ' + (b.inv[k] || 0) + '/' + r.in[k]).join(', ')}`;
        s += b.on ? '<br>🔨 Trabajando…' : '<br><i>Clic para cambiar la receta.</i>';
      } else if (b.type === 'muelle') {
        s += `Carga esperando: ${PV.Inv.sum(b.store)} / ${D.DOCK_CAP}` + (b.unload.length ? `<br>Descarga del barco: ${b.unload.map(k => D.RES[k].n).join(', ')}` : '') + '<br><i>Clic para elegir qué descargar.</i>';
      }
      return s + '<br><span style="opacity:.7">R rotar · clic derecho quitar</span>';
    }
    const idx = ty * g.w + tx;
    if (g.res[idx]) return `<b>${D.RES[g.res[idx]].n}</b><br>Quedan: ${g.amt[idx]}`;
    return '';
  };

  // ---------- Dibujo ----------

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawArrow(ctx, b) {
    const def = D.BUILD[b.type], [dx, dy] = DIRS[b.dir];
    const cx = (b.x + def.w / 2) * T, cy = (b.y + def.h / 2) * T;
    const off = (def.w / 2) * T - 7;
    ctx.save();
    ctx.translate(cx + dx * off, cy + dy * off);
    ctx.rotate(b.dir * Math.PI / 2);
    ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Persona vista desde arriba, mirando hacia el ángulo a.
  function drawPerson(ctx, x, y, a, shirt, swing, hat) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(1.5, 2, 5, 6.5, 0, 0, TAU); ctx.fill();
    const sw = Math.sin(swing || 0) * 2.5;
    ctx.fillStyle = '#d9a877';
    ctx.beginPath(); ctx.arc(1 + sw, -5.2, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1 - sw, 5.2, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 5.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9a877'; ctx.beginPath(); ctx.arc(0.5, 0, 2.8, 0, TAU); ctx.fill();
    ctx.fillStyle = hat || '#5a3a1e'; ctx.beginPath(); ctx.arc(-0.3, 0, 2.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    ctx.restore();
  }

  // Trabajador con herramienta (pico, hacha, martillo) que se mueve si está trabajando.
  function drawWorker(ctx, x, y, a, shirt, swing, tool) {
    drawPerson(ctx, x, y, a, shirt, 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.sin(swing) * 0.7);
    ctx.strokeStyle = '#6d4c2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(12, 4); ctx.stroke();
    ctx.fillStyle = tool === 'hacha' ? '#b0b6bb' : '#7d858c';
    if (tool === 'pico') ctx.fillRect(11, -0.5, 2.5, 9);
    else if (tool === 'hacha') ctx.fillRect(10, 4, 4, 4);
    else ctx.fillRect(10.5, 1, 4, 6);
    ctx.restore();
  }

  function drawBundle(ctx, x, y, k, s) {
    s = s || 4.5;
    ctx.fillStyle = D.RES[k].c; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2;
    rrect(ctx, x - s, y - s, s * 2, s * 2, 2.5); ctx.fill(); ctx.stroke();
  }

  // Porteador caminando con un bulto en la cabeza.
  function drawPorter(ctx, x, y, dir, k, t) {
    drawPerson(ctx, x, y, dir * Math.PI / 2, '#8a6d4a', t * 9 + (x + y) * 0.3);
    drawBundle(ctx, x, y, k);
  }

  // Sendero de tierra (la "cinta"): marcas de pisadas hacia la flecha.
  function drawBelt(ctx, b) {
    const px = b.x * T, py = b.y * T;
    ctx.fillStyle = '#b8925f'; ctx.fillRect(px, py, T, T);
    ctx.save();
    ctx.translate(px + T / 2, py + T / 2);
    ctx.rotate(b.dir * Math.PI / 2);
    ctx.fillStyle = 'rgba(80,55,25,0.25)';
    ctx.fillRect(-T / 2, -T / 2, T, 3); ctx.fillRect(-T / 2, T / 2 - 3, T, 3);
    ctx.fillStyle = 'rgba(120,90,50,0.6)';
    for (let i = 0; i < 3; i++) {
      const h = U.hash(b.x * 7 + i, b.y * 13 - i);
      ctx.beginPath(); ctx.arc(-12 + h * 24, -9 + U.hash(b.y + i, b.x) * 18, 1.4, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,60,30,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const x of [-6, 6]) { ctx.moveTo(x - 3, -5); ctx.lineTo(x + 2, 0); ctx.lineTo(x - 3, 5); }
    ctx.stroke();
    ctx.restore();
  }

  function drawItem(ctx, x, y, k) { drawBundle(ctx, x, y, k, 5); }

  function floor(ctx, px, py, w, h, fill, line) {
    ctx.fillStyle = fill; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 7); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawMachine(ctx, b, isl, t) {
    const def = D.BUILD[b.type], px = b.x * T, py = b.y * T, w = def.w * T, h = def.h * T;
    const cx = px + w / 2, cy = py + h / 2;
    const busy = isl ? t * 8 + (b.id || 0) : 0;
    if (def.w > 1) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(ctx, px + 5, py + 6, w - 6, h - 6, 6); ctx.fill(); }

    if (b.type === 'extractor') {
      const tot = isl ? resUnder(isl, b) : {};
      const main = Object.keys(tot).sort((a, c) => tot[c] - tot[a])[0];
      const working = isl && !b.empty && !(b.out && b.out.length);
      const sw = working ? busy : 0;
      if (main === 'madera') {
        // Campamento de leñadores: troncos apilados y tocones.
        floor(ctx, px, py, w, h, '#6f9445', '#3f5a26');
        ctx.fillStyle = '#2e6b2a'; ctx.beginPath(); ctx.arc(px + 22, py + 22, 14, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3f8a36'; ctx.beginPath(); ctx.arc(px + 18, py + 18, 7, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#7a5230'; rrect(ctx, cx - 6, cy + 4 + i * 7, 34, 6, 3); ctx.fill();
          ctx.fillStyle = '#c9a26b'; ctx.beginPath(); ctx.arc(cx - 6, cy + 7 + i * 7, 3, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#8a6440'; ctx.beginPath(); ctx.arc(px + w - 20, py + 20, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c9a26b'; ctx.beginPath(); ctx.arc(px + w - 20, py + 20, 3.5, 0, TAU); ctx.fill();
        drawWorker(ctx, px + 40, py + 24, Math.PI, '#7b3f2a', sw, 'hacha');
        drawWorker(ctx, px + 22, py + h - 22, -Math.PI / 2, '#3d5a80', sw + 1.5, 'hacha');
      } else {
        // Boca de mina en la roca, con vigas y una vagoneta.
        floor(ctx, px, py, w, h, '#8a7a62', '#4e4232');
        ctx.fillStyle = '#6d6458'; ctx.beginPath(); ctx.ellipse(cx, cy - 10, 36, 24, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5c544a'; ctx.beginPath(); ctx.ellipse(cx - 12, cy - 18, 14, 9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1b1410';
        ctx.beginPath(); ctx.moveTo(cx - 11, cy + 2); ctx.lineTo(cx - 11, cy - 8); ctx.arc(cx, cy - 8, 11, Math.PI, 0); ctx.lineTo(cx + 11, cy + 2); ctx.fill();
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(cx - 15, cy - 20, 4, 23); ctx.fillRect(cx + 11, cy - 20, 4, 23); ctx.fillRect(cx - 16, cy - 22, 32, 4);
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - 4, cy + 2); ctx.lineTo(cx - 4, py + h - 6); ctx.moveTo(cx + 4, cy + 2); ctx.lineTo(cx + 4, py + h - 6); ctx.stroke();
        ctx.fillStyle = '#5a4632'; rrect(ctx, cx - 7, cy + 14, 14, 11, 2); ctx.fill();
        ctx.fillStyle = main ? D.RES[main].c : '#999';
        ctx.beginPath(); ctx.arc(cx - 3, cy + 16, 3, 0, TAU); ctx.arc(cx + 3, cy + 17, 3, 0, TAU); ctx.fill();
        drawWorker(ctx, px + 20, py + h - 22, -Math.PI / 2, '#7b3f2a', sw, 'pico');
        drawWorker(ctx, px + w - 20, py + h - 24, -Math.PI / 2 - 0.4, '#556b2f', sw + 2, 'pico');
      }
      if (b.empty) {
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(px + 20, py + 20); ctx.lineTo(px + w - 20, py + h - 20);
        ctx.moveTo(px + w - 20, py + 20); ctx.lineTo(px + 20, py + h - 20); ctx.stroke();
      }
    } else if (b.type === 'fundicion') {
      floor(ctx, px, py, w, h, '#8e3b2e', '#4a1d16');
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let r = 1; r < 6; r++) { ctx.beginPath(); ctx.moveTo(px + 4, py + r * 16); ctx.lineTo(px + w - 4, py + r * 16); ctx.stroke(); }
      const glow = b.on ? 0.6 + Math.sin(t * 12) * 0.2 : 0.1;
      ctx.fillStyle = '#2a1410'; rrect(ctx, cx - 18, cy - 12, 36, 26, 10); ctx.fill();
      ctx.fillStyle = `rgba(255,${120 + Math.floor(glow * 80)},30,${glow})`; rrect(ctx, cx - 14, cy - 8, 28, 18, 8); ctx.fill();
      ctx.fillStyle = '#3d3d3d'; ctx.beginPath(); ctx.arc(px + w - 18, py + 18, 9, 0, TAU); ctx.fill();
      if (b.on) {
        ctx.fillStyle = 'rgba(90,90,90,0.4)';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.8 + i / 3) % 1;
          ctx.beginPath(); ctx.arc(px + w - 18 + ph * 8, py + 18 - ph * 30, 5 + ph * 7, 0, TAU); ctx.fill();
        }
      }
      drawWorker(ctx, cx, py + h - 16, -Math.PI / 2, '#5a3a1e', b.on ? busy * 0.6 : 0, 'pico');
    } else if (b.type === 'aserradero') {
      floor(ctx, px, py, w, h, '#9a6a3a', '#4e3115');
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(px + i * 16, py + 4); ctx.lineTo(px + i * 16, py + h - 4); ctx.stroke(); }
      ctx.save(); ctx.translate(cx, cy - 6); ctx.rotate(b.on ? t * 10 : 0);
      ctx.fillStyle = '#c8ccd0'; ctx.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = k % 2 ? 20 : 15; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
      drawWorker(ctx, px + 22, py + h - 18, -Math.PI / 2, '#3d5a80', b.on ? busy : 0, 'martillo');
      drawWorker(ctx, px + w - 22, py + h - 18, -Math.PI / 2, '#7b3f2a', b.on ? busy + 2 : 0, 'martillo');
    } else if (b.type === 'almacen') {
      ctx.fillStyle = '#a5713e'; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 4); ctx.fill();
      ctx.strokeStyle = '#5e3b1c'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + w - 6, py + h - 6);
      ctx.moveTo(px + w - 6, py + 6); ctx.lineTo(px + 6, py + h - 6); ctx.stroke();
      if (isl) {
        const cap = PV.Inv.storageCap(isl), f = cap ? PV.Inv.storageTotal(isl) / cap : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px + 6, py + h - 10, w - 12, 5);
        ctx.fillStyle = f > 0.9 ? '#e74c3c' : '#58d26b'; ctx.fillRect(px + 6, py + h - 10, (w - 12) * Math.min(1, f), 5);
      }
    } else if (b.type === 'herreria') {
      // Piso de piedra, fragua encendida, yunque y el herrero con su martillo.
      floor(ctx, px, py, w, h, '#7d7268', '#3f3a35');
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { ctx.strokeRect(px + i * 32 - 32 + 4, py + 4, 32, h - 8); }
      const glow = b.on ? 0.65 + Math.sin(t * 10) * 0.2 : 0.15;
      ctx.fillStyle = '#3a3330'; ctx.beginPath(); ctx.arc(px + w - 22, py + 22, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,140,40,${glow})`; ctx.beginPath(); ctx.arc(px + w - 22, py + 22, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2b2b'; rrect(ctx, cx - 14, cy + 2, 28, 10, 3); ctx.fill();
      ctx.fillStyle = '#444'; ctx.fillRect(cx - 5, cy + 12, 10, 8);
      drawWorker(ctx, cx, cy - 12, Math.PI / 2, '#5a3a1e', b.on ? busy * 1.3 : 0, 'martillo');
      ctx.fillStyle = '#4a4f55';
      for (let i = 0; i < Math.min(4, (b.out || []).length); i++) { ctx.beginPath(); ctx.arc(px + 14 + i * 7, py + h - 14, 3, 0, TAU); ctx.fill(); }
    } else if (b.type === 'taller') {
      // Tablones, mesa de trabajo, barriles y dos artesanos.
      floor(ctx, px, py, w, h, '#b08a5a', '#5e3b1c');
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(px + 4, py + i * 12); ctx.lineTo(px + w - 4, py + i * 12); ctx.stroke(); }
      ctx.fillStyle = '#6b4423'; rrect(ctx, cx - 22, cy - 8, 44, 16, 3); ctx.fill();
      const r = b.recipe && D.RECIPES.taller[b.recipe];
      if (r) { drawBundle(ctx, cx - 10, cy, Object.keys(r.in)[0], 3.5); drawBundle(ctx, cx + 10, cy, r.out, 3.5); }
      for (const [bx, by] of [[px + 14, py + 14], [px + 26, py + 12]]) {
        ctx.fillStyle = '#7a5230'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      drawWorker(ctx, cx - 12, cy + 18, -Math.PI / 2, '#7b3f2a', b.on ? busy : 0, 'martillo');
      drawWorker(ctx, cx + 12, cy - 18, Math.PI / 2, '#556b2f', b.on ? busy + 2 : 0, 'martillo');
    } else if (b.type === 'muelle') {
      // Tablas sobre pilotes y cajones apilados esperando el barco.
      ctx.fillStyle = '#9a6b3d'; ctx.fillRect(px + 1, py + 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(40,25,10,0.45)'; ctx.lineWidth = 1.5;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(px + i * 8, py + 1); ctx.lineTo(px + i * 8, py + h - 1); ctx.stroke(); }
      ctx.fillStyle = '#4a3020';
      for (const [ox, oy] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { ctx.beginPath(); ctx.arc(px + ox, py + oy, 4, 0, TAU); ctx.fill(); }
      const keys = b.store ? Object.keys(b.store).sort((a, c) => b.store[c] - b.store[a]).slice(0, 4) : [];
      keys.forEach((k, i) => drawBundle(ctx, px + 20 + (i % 2) * 24, py + 20 + Math.floor(i / 2) * 24, k, 7));
      ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center';
      if (!keys.length) ctx.fillText('⚓', cx, cy + 5);
    } else if (b.type === 'clasificador') {
      // Capataz con su cartel: lo elegido sigue derecho, lo demás a los costados.
      drawBelt(ctx, b);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.dir * Math.PI / 2);
      ctx.fillStyle = 'rgba(200,200,200,0.85)';
      for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-2, sy * 15); ctx.lineTo(3, sy * 10); ctx.lineTo(-7, sy * 10); ctx.fill(); }
      ctx.restore();
      drawPerson(ctx, cx - 3, cy, b.dir * Math.PI / 2, '#8e1b1b', 0, '#1a1a1a');
      ctx.fillStyle = '#6d4c2a'; ctx.fillRect(px + T - 9, py + 3, 2, 10);
      ctx.fillStyle = b.filter ? D.RES[b.filter].c : '#f4ecd8'; ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 1;
      ctx.fillRect(px + T - 13, py + 2, 10, 7); ctx.strokeRect(px + T - 13, py + 2, 10, 7);
      if (b.hold) drawBundle(ctx, cx + 6, cy + 6, b.hold, 3.5);
    } else if (b.type === 'insertador') {
      // Estibador: camina de atrás hacia adelante llevando una cosa por vez.
      ctx.fillStyle = '#a07a4a'; ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 1, cy); ctx.lineTo(px + T - 1, cy); ctx.stroke();
      const [dx, dy] = DIRS[b.dir], f = b.hand ? (b.prog || 0) - 0.5 : -0.3;
      const x = cx + dx * f * T * 0.6, y = cy + dy * f * T * 0.6;
      drawPerson(ctx, x, y, b.dir * Math.PI / 2, '#2f4f6f', b.hand ? t * 9 : 0, '#7a1f1f');
      if (b.hand) drawBundle(ctx, x, y, b.hand, 4);
      if (b.filter) { ctx.fillStyle = D.RES[b.filter].c; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(px + 6, py + 6, 3.5, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
    if (b.type !== 'almacen' && b.type !== 'muelle') drawArrow(ctx, b);
  }

  function drawTiles(ctx, isl, x0, y0, x1, y1, t) {
    const g = isl.grid;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const l = g.land[y * g.w + x];
        const h = U.hash(x + isl.id * 101, y);
        if (!l) {
          if (landAt(isl, x - 1, y) || landAt(isl, x + 1, y) || landAt(isl, x, y - 1) || landAt(isl, x, y + 1)) {
            ctx.fillStyle = 'rgba(140,220,225,0.35)'; ctx.fillRect(x * T, y * T, T, T);
          } else if (h > 0.85) {
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
            const wx = x * T + 16 + Math.sin(t + h * 20) * 4, wy = y * T + 16;
            ctx.beginPath(); ctx.moveTo(wx - 7, wy); ctx.quadraticCurveTo(wx, wy - 5, wx + 7, wy); ctx.stroke();
          }
          continue;
        }
        ctx.fillStyle = l === 1 ? (h > 0.5 ? '#e6d29c' : '#e0cb92') : (h > 0.5 ? '#5ca24c' : '#56994a');
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
    // Yacimientos
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = y * g.w + x, k = g.res[idx];
        if (!k) continue;
        const a = g.amt[idx], px = x * T, py = y * T;
        if (k === 'madera') {
          const s = 0.55 + Math.min(1, a / 200) * 0.45;
          const ox = (U.hash(x, y + 3) - 0.5) * 8, oy = (U.hash(x + 3, y) - 0.5) * 8;
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(px + 18 + ox, py + 19 + oy, 12 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2e6b2a'; ctx.beginPath(); ctx.arc(px + 16 + ox, py + 16 + oy, 12 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3f8a36'; ctx.beginPath(); ctx.arc(px + 13 + ox, py + 13 + oy, 6 * s, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, py, T, T);
          const n = a > 180 ? 4 : a > 80 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const rx = px + 6 + U.hash(x * 7 + i, y * 3) * 20, ry = py + 6 + U.hash(x * 5, y * 11 + i) * 20;
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(rx + 1, ry + 1.5, 5, 0, TAU); ctx.fill();
            ctx.fillStyle = D.RES[k].c; ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, TAU); ctx.fill();
          }
        }
      }
    }
  }

  // Miniatura de un edificio (para la barra de construcción), con el mismo dibujo que en el juego.
  Isl.thumb = function (type) {
    const def = D.BUILD[type], size = 64, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const s = size / (Math.max(def.w, def.h) * T + 8);
    ctx.scale(s, s);
    ctx.translate(4, 4);
    const b = { type, x: 0, y: 0, dir: 0, id: 0.6, items: [] };
    if (type === 'cinta') {
      drawBelt(ctx, b);
      drawPorter(ctx, T * 0.5, T * 0.5, 0, 'cobre', 0.3);
    } else drawMachine(ctx, b, null, 0);
    return cv.toDataURL();
  };

  Isl.render = function (ctx) {
    const isl = Isl.cur, c = Isl.cam, t = PV.time, g = isl.grid;
    ctx.fillStyle = '#1d5f8a'; ctx.fillRect(0, 0, PV.W, PV.H);
    ctx.save();
    ctx.translate(PV.W / 2, PV.H / 2); ctx.scale(c.z, c.z); ctx.translate(-c.x, -c.y);

    const [wx0, wy0] = screenToWorld(0, 0), [wx1, wy1] = screenToWorld(PV.W, PV.H);
    const x0 = Math.max(0, Math.floor(wx0 / T)), y0 = Math.max(0, Math.floor(wy0 / T));
    const x1 = Math.min(g.w - 1, Math.floor(wx1 / T)), y1 = Math.min(g.h - 1, Math.floor(wy1 / T));
    drawTiles(ctx, isl, x0, y0, x1, y1, t);

    if (Isl.sel) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * T, y0 * T); ctx.lineTo(x * T, (y1 + 1) * T); }
      for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * T, y * T); ctx.lineTo((x1 + 1) * T, y * T); }
      ctx.stroke();
    }

    for (const b of isl.buildings) if (b.type === 'cinta') drawBelt(ctx, b);
    for (const b of isl.buildings) {
      if (b.type !== 'cinta') continue;
      const [dx, dy] = DIRS[b.dir];
      for (const it of b.items) drawPorter(ctx, b.x * T + T / 2 + dx * (it.p - 0.5) * T, b.y * T + T / 2 + dy * (it.p - 0.5) * T, b.dir, it.t, t);
    }
    for (const b of isl.buildings) if (b.type !== 'cinta') drawMachine(ctx, b, isl, t);

    // Fantasma del edificio a colocar
    if (Isl.sel && Isl.hover) {
      const def = D.BUILD[Isl.sel];
      const [x, y] = ghostPos(Isl.sel, Isl.hover[0], Isl.hover[1]);
      const ok = Isl.canPlace(isl, Isl.sel, x, y) && PV.Inv.canPay(def.cost, isl);
      const ghost = { type: Isl.sel, x, y, dir: Isl.dir, id: 0, items: [] };
      ctx.globalAlpha = 0.6;
      if (Isl.sel === 'cinta') drawBelt(ctx, ghost); else drawMachine(ctx, ghost, null, t);
      if (Isl.sel === 'cinta') drawArrow(ctx, ghost);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? '#58d26b' : '#e74c3c'; ctx.lineWidth = 2;
      ctx.strokeRect(x * T + 1, y * T + 1, def.w * T - 2, def.h * T - 2);
    } else if (Isl.hover && inside(isl, Isl.hover[0], Isl.hover[1])) {
      const b = occAt(isl, Isl.hover[0], Isl.hover[1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      if (b) { const def = D.BUILD[b.type]; ctx.strokeRect(b.x * T, b.y * T, def.w * T, def.h * T); }
      else ctx.strokeRect(Isl.hover[0] * T, Isl.hover[1] * T, T, T);
    }
    ctx.restore();
  };

  PV.Island = Isl;
})(window.PV);
