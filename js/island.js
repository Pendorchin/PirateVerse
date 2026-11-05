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
    return type !== 'extractor' || res > 0;
  };

  function tryPlace(isl, type, x, y, dir, quiet) {
    if (!Isl.canPlace(isl, type, x, y)) {
      if (!quiet) PV.UI.toast(type === 'extractor' ? 'El extractor tiene que ir sobre un yacimiento.' : 'No se puede construir ahí.', 'bad');
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
    for (const k of back) PV.Inv.add(isl.storage, k, 1);
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

  function beltInsert(belt, item) {
    const last = belt.items[belt.items.length - 1];
    if (last && last.p < GAP) return false;
    belt.items.push({ t: item, p: 0 });
    return true;
  }

  function accept(isl, b, item) {
    switch (b.type) {
      case 'almacen':
        if (PV.Inv.storageTotal(isl) >= PV.Inv.storageCap(isl)) return false;
        PV.Inv.add(isl.storage, item, 1);
        return true;
      case 'fundicion':
        if (D.SMELT[item] && (b.oreN === 0 || b.ore === item) && b.oreN < 10) { b.ore = item; b.oreN++; return true; }
        if (D.FUEL[item] && b.fuel < 6) { b.fuel += D.FUEL[item]; return true; }
        return false;
      case 'aserradero':
        if (item === 'madera' && b.n < 10) { b.n++; return true; }
        return false;
    }
    return false;
  }

  function give(isl, from, x, y, item) {
    const t = occAt(isl, x, y);
    if (!t || t === from) return false;
    return t.type === 'cinta' ? beltInsert(t, item) : accept(isl, t, item);
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
      if (e.button === 1) { Isl.pan = [e.clientX, e.clientY]; e.preventDefault(); }
      else if (e.button === 2) { removeAt(isl, tx, ty); Isl.drag = { mode: 'remove' }; }
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
        if (b.out.length) s += '<br><i>Salida bloqueada: conectá una cinta o un almacén a la flecha.</i>';
      } else if (b.type === 'fundicion') {
        s += `Mineral: ${b.oreN ? D.RES[b.ore].n + ' ×' + b.oreN : '—'}<br>Combustible: ${b.fuel}`;
        s += b.on ? '<br>🔥 Fundiendo…' : '<br><i>Necesita 2 minerales y combustible (madera o carbón).</i>';
      } else if (b.type === 'aserradero') {
        s += `Madera: ${b.n}` + (b.on ? '<br>🪚 Cortando…' : '<br><i>Mandale madera por una cinta.</i>');
      } else if (b.type === 'almacen') {
        s += `Almacén de la isla: ${PV.Inv.storageTotal(isl)} / ${PV.Inv.storageCap(isl)}`;
      } else if (b.type === 'cinta') {
        s += `Objetos: ${b.items.length}`;
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

  function drawBelt(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x * T + T / 2, b.y * T + T / 2);
    ctx.rotate(b.dir * Math.PI / 2);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-T / 2, -T / 2 + 3, T, T - 6);
    ctx.fillStyle = '#474747'; ctx.fillRect(-T / 2, -T / 2 + 6, T, T - 12);
    ctx.beginPath(); ctx.rect(-T / 2, -T / 2, T, T); ctx.clip();
    ctx.strokeStyle = 'rgba(241,196,15,0.55)'; ctx.lineWidth = 2;
    const ph = ((t * BELT_SPEED) % 1) * T;
    ctx.beginPath();
    for (let k = -1; k < 2; k++) {
      const x = -T / 2 + ph + k * (T / 2);
      ctx.moveTo(x - 4, -6); ctx.lineTo(x + 2, 0); ctx.lineTo(x - 4, 6);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawItem(ctx, x, y, k) {
    ctx.fillStyle = D.RES[k].c;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.stroke();
  }

  function drawMachine(ctx, b, isl, t) {
    const def = D.BUILD[b.type], px = b.x * T, py = b.y * T, w = def.w * T, h = def.h * T;
    const cx = px + w / 2, cy = py + h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(ctx, px + 5, py + 6, w - 6, h - 6, 6); ctx.fill();

    if (b.type === 'extractor') {
      ctx.fillStyle = '#545454'; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 7); ctx.fill();
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2; ctx.stroke();
      const tot = isl ? resUnder(isl, b) : {};
      const main = Object.keys(tot).sort((a, c) => tot[c] - tot[a])[0];
      ctx.strokeStyle = main ? D.RES[main].c : '#777'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.stroke();
      ctx.save(); ctx.translate(cx, cy);
      const working = isl && !b.empty && !(b.out && b.out.length);
      ctx.rotate(working ? t * 4 : b.id || 0);
      ctx.fillStyle = '#8c8c8c'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); ctx.stroke();
      }
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
      if (b.empty) {
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(px + 20, py + 20); ctx.lineTo(px + w - 20, py + h - 20);
        ctx.moveTo(px + w - 20, py + 20); ctx.lineTo(px + 20, py + h - 20); ctx.stroke();
      }
    } else if (b.type === 'fundicion') {
      ctx.fillStyle = '#8e3b2e'; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 7); ctx.fill();
      ctx.strokeStyle = '#4a1d16'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let r = 1; r < 6; r++) {
        ctx.beginPath(); ctx.moveTo(px + 4, py + r * 16); ctx.lineTo(px + w - 4, py + r * 16); ctx.stroke();
      }
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
    } else if (b.type === 'aserradero') {
      ctx.fillStyle = '#9a6a3a'; rrect(ctx, px + 2, py + 2, w - 4, h - 4, 7); ctx.fill();
      ctx.strokeStyle = '#4e3115'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(px + i * 16, py + 4); ctx.lineTo(px + i * 16, py + h - 4); ctx.stroke(); }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.on ? t * 10 : 0);
      ctx.fillStyle = '#c8ccd0'; ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU, r = k % 2 ? 22 : 17;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
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
    }
    if (b.type !== 'almacen') drawArrow(ctx, b);
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

    for (const b of isl.buildings) if (b.type === 'cinta') drawBelt(ctx, b, t);
    for (const b of isl.buildings) {
      if (b.type !== 'cinta') continue;
      const [dx, dy] = DIRS[b.dir];
      for (const it of b.items) drawItem(ctx, b.x * T + T / 2 + dx * (it.p - 0.5) * T, b.y * T + T / 2 + dy * (it.p - 0.5) * T, it.t);
    }
    for (const b of isl.buildings) if (b.type !== 'cinta') drawMachine(ctx, b, isl, t);

    // Fantasma del edificio a colocar
    if (Isl.sel && Isl.hover) {
      const def = D.BUILD[Isl.sel];
      const [x, y] = ghostPos(Isl.sel, Isl.hover[0], Isl.hover[1]);
      const ok = Isl.canPlace(isl, Isl.sel, x, y) && PV.Inv.canPay(def.cost, isl);
      const ghost = { type: Isl.sel, x, y, dir: Isl.dir, id: 0, items: [] };
      ctx.globalAlpha = 0.6;
      if (Isl.sel === 'cinta') drawBelt(ctx, ghost, t); else drawMachine(ctx, ghost, null, t);
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
