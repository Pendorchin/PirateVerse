// Vista del mar: navegación, niebla de guerra, combate en tiempo real y conquista.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D, Wd = PV.World;
  const TAU = Math.PI * 2;
  const REVEAL = 460;
  const Sea = { enemies: [], bullets: [], parts: [], texts: [], near: null, shake: 0, zoom: 1 };

  Sea.stats = function () {
    const up = PV.state.ship.up;
    const c = D.UP.canones.lv[up.canones];
    return {
      cap: D.UP.bodega.lv[up.bodega].v,
      maxHp: D.UP.casco.lv[up.casco].v,
      guns: c.v, dmg: c.dmg,
      speed: D.UP.velas.lv[up.velas].v * PV.Colony.shipMul(), // con hambre o sin ánimo la tripulación rema peor
      reload: 2.2,
    };
  };

  Sea.init = function () {
    Sea.enemies = []; Sea.bullets = []; Sea.parts = []; Sea.texts = []; Sea.wrecks = [];
    for (const isl of PV.state.islands) {
      if (isl.owned || isl.port) continue;
      const n = D.TIERS[isl.tier].guards;
      for (let i = 0; i < n; i++) spawnGuard(isl, (i / n) * TAU);
      isl._gt = 120;
    }
    const sh = PV.state.ship;
    sh.rl = 0; sh.rr = 0; sh.sunk = 0;
    reveal(sh.x, sh.y, REVEAL);
    Sea.zoneK = Wd.zoneAt(sh.x, sh.y);
  };

  // Al cruzar a otro mar, un aviso con lo que se vende y se paga bien ahí.
  function checkZone(sh) {
    const k = Wd.zoneAt(sh.x, sh.y);
    if (k === Sea.zoneK) return;
    Sea.zoneK = k;
    const Z = D.ZONES[k];
    PV.UI.toast(`🧭 Entrás en ${Z.n}. Sus puertos venden ${PV.Port.names(Z.goods)} y pagan bien ${PV.Port.names(Z.wants)}.`);
  }

  function spawnGuard(isl, ang) {
    const t = isl.tier, pr = isl.R + 190, hp = 40 + t * 35;
    Sea.enemies.push({
      x: isl.x + Math.cos(ang) * pr, y: isl.y + Math.sin(ang) * pr, a: ang + Math.PI / 2, v: 50,
      home: isl.id, pa: ang, tier: t, hp, max: hp, guns: Math.min(t, 5), dmg: 4 + t * 2,
      speed: 85 + t * 12, rl: 1 + Math.random() * 2, rr: 1 + Math.random() * 2, aggro: false,
    });
  }

  // Barco de un asalto pirata: navega hacia la isla atacada (home) y la rodea.
  Sea.spawnRaider = function (isl, x, y, t, a) {
    const hp = 40 + t * 35;
    Sea.enemies.push({
      x, y, a, v: 60, home: isl.id, pa: Math.atan2(y - isl.y, x - isl.x), tier: t, hp, max: hp, guns: Math.min(t + 1, 5), dmg: 4 + t * 2,
      speed: 85 + t * 12, rl: 1 + Math.random() * 2, rr: 1 + Math.random() * 2, aggro: false, raid: true,
    });
  };

  // Disparo de una batería de la isla al barco e. En el mar se ve la bala; fuera, se resuelve al instante.
  Sea.batteryShot = function (x, y, e, dmg) {
    if (PV.scene === 'sea') {
      const spd = 380, d = U.dist(x, y, e.x, e.y), tt = d / spd;
      const tx = e.x + Math.cos(e.a) * e.v * tt, ty = e.y + Math.sin(e.a) * e.v * tt;
      const ang = Math.atan2(ty - y, tx - x) + (Math.random() - 0.5) * 0.06;
      Sea.bullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: Math.min(1.5, tt + 0.25), o: 'p', dmg });
      for (let k = 0; k < 5; k++) puff(x, y, Math.cos(ang) * 50, Math.sin(ang) * 50, 'rgba(230,230,230,0.8)', 0.7, 6);
    } else if (Math.random() < 0.75) damageEnemy(e, dmg);
  };

  Sea.towersAlive = isl => isl.towers.filter(t => t.hp > 0).length;
  Sea.guardsAlive = isl => Sea.enemies.filter(e => e.home === isl.id).length;
  Sea.conquerCost = isl => 60 + (isl.tier - 1) * 150;
  Sea.islandRes = isl => (isl.home ? ['madera', 'piedra', 'cobre'] : isl.res || D.TIERS[isl.tier].res);

  // ---------- Física ----------

  Sea.collide = (o, pad) => collide(o, pad);

  function collide(o, pad) {
    for (const isl of PV.state.islands) {
      const dx = o.x - isl.x, dy = o.y - isl.y;
      const d = Math.hypot(dx, dy);
      if (d > isl.R * 1.4 + pad) continue;
      const a = Math.atan2(dy, dx);
      const rr = Wd.radius(isl, a) + pad;
      if (d < rr) {
        o.x = isl.x + Math.cos(a) * rr;
        o.y = isl.y + Math.sin(a) * rr;
        o.v *= 0.85;
        return true;
      }
    }
    return false;
  }

  function reveal(x, y, rad) {
    const S = PV.state, c = Wd.FOG_CELL, n = Wd.FOG_N;
    const i0 = Math.max(0, Math.floor((x - rad) / c)), i1 = Math.min(n - 1, Math.floor((x + rad) / c));
    const j0 = Math.max(0, Math.floor((y - rad) / c)), j1 = Math.min(n - 1, Math.floor((y + rad) / c));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (U.dist(x, y, (i + 0.5) * c, (j + 0.5) * c) < rad) S.fog[j * n + i] = 1;
      }
    }
    for (const isl of S.islands) {
      if (!isl.explored && U.dist(x, y, isl.x, isl.y) < rad + isl.R * 0.5) isl.explored = true;
    }
  }

  // ---------- Partículas ----------

  function puff(x, y, vx, vy, c, life, size) {
    if (Sea.parts.length > 700) return;
    Sea.parts.push({ x, y, vx, vy, c, life, max: life, size });
  }
  function splash(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * TAU, s = 20 + Math.random() * 50;
      puff(x, y, Math.cos(a) * s, Math.sin(a) * s, 'rgba(220,240,255,0.9)', 0.5 + Math.random() * 0.3, 3 + Math.random() * 3);
    }
  }
  function explosion(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 30 + Math.random() * 90;
      puff(x, y, Math.cos(a) * s, Math.sin(a) * s, i % 3 ? 'rgba(255,150,40,0.95)' : 'rgba(70,70,70,0.8)', 0.4 + Math.random() * 0.5, 4 + Math.random() * 5);
    }
  }
  function addWreck(x, y) {
    Sea.wrecks.push({ x, y, life: 45 });
    if (Sea.wrecks.length > 12) Sea.wrecks.shift();
  }

  function floatText(x, y, t, c) { Sea.texts.push({ x, y, t, c, life: 1.1 }); }

  // ---------- Combate ----------

  function fire(src, side, guns, dmg, owner) {
    const pa = src.a + side * Math.PI / 2, ca = Math.cos(src.a), sa = Math.sin(src.a);
    for (let i = 0; i < guns; i++) {
      const off = guns === 1 ? 0 : (i / (guns - 1) - 0.5) * 26;
      const x = src.x + ca * off + Math.cos(pa) * 12, y = src.y + sa * off + Math.sin(pa) * 12;
      const ang = pa + (Math.random() - 0.5) * 0.08, spd = 420;
      Sea.bullets.push({
        x, y, vx: Math.cos(ang) * spd + ca * src.v, vy: Math.sin(ang) * spd + sa * src.v,
        life: 0.8 + Math.random() * 0.15, o: owner, dmg,
      });
      for (let k = 0; k < 4; k++) {
        puff(x, y, Math.cos(pa) * 40 + (Math.random() - 0.5) * 30, Math.sin(pa) * 40 + (Math.random() - 0.5) * 30, 'rgba(230,230,230,0.8)', 0.7, 6);
      }
    }
  }

  Sea.firePlayer = function (side) {
    const sh = PV.state.ship;
    if (sh.sunk > 0) return;
    const key = side < 0 ? 'rl' : 'rr';
    if (sh[key] > 0) return;
    const st = Sea.stats();
    sh[key] = st.reload;
    // Usa la mejor munición que haya en la bodega; sin munición tira metralla común.
    const am = D.AMMO.find(a => sh.cargo[a.k] > 0);
    let dmg = st.dmg;
    if (am) {
      const used = Math.min(st.guns, sh.cargo[am.k]);
      PV.Inv.add(sh.cargo, am.k, -used);
      dmg = Math.round(st.dmg * (1 + (am.mult - 1) * used / st.guns));
    }
    fire(sh, side, st.guns, dmg, 'p');
    Sea.shake = Math.max(Sea.shake, 4);
  };

  function loot(tier, x, y) {
    const S = PV.state;
    const gold = 20 * tier + Math.floor(Math.random() * 15 * tier);
    S.doblones += gold;
    floatText(x, y - 20, `+${gold} 💰`, '#ffd84a');
    if (Math.random() < 0.6) {
      const list = D.TIERS[tier].res;
      const k = list[Math.floor(Math.random() * list.length)];
      const got = PV.Inv.addCargo(k, 2 + Math.floor(Math.random() * 4));
      if (got) floatText(x, y - 40, `+${got} ${D.RES[k].n}`, '#fff');
    }
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.aggro = true;
    floatText(e.x, e.y - 18, '-' + dmg, '#ffcc66');
    if (e.hp <= 0) {
      explosion(e.x, e.y, 30);
      addWreck(e.x, e.y);
      Sea.enemies.splice(Sea.enemies.indexOf(e), 1);
      loot(e.tier, e.x, e.y);
      PV.UI.toast('¡Barco pirata hundido!', 'good');
      if (e.raid) PV.Raid.onKill(e);
      else checkClear(PV.state.islands[e.home]);
    }
  }

  function damageTower(isl, tw, dmg) {
    tw.hp -= dmg;
    floatText(tw.x, tw.y - 20, '-' + dmg, '#ffcc66');
    if (tw.hp <= 0) {
      tw.hp = 0;
      PV.state.towersKilled = (PV.state.towersKilled || 0) + 1;
      explosion(tw.x, tw.y, 35);
      loot(isl.tier, tw.x, tw.y);
      PV.UI.toast('¡Torre destruida!', 'good');
      checkClear(isl);
    }
  }

  function checkClear(isl) {
    if (!isl || isl.owned) return;
    if (Sea.towersAlive(isl) === 0 && Sea.guardsAlive(isl) === 0) {
      PV.UI.toast(`${isl.name} quedó sin defensas. ¡Acercate y fundá tu fuerte!`, 'good');
    }
  }

  function damagePlayer(dmg) {
    const S = PV.state, sh = S.ship;
    sh.hp -= dmg;
    Sea.shake = Math.max(Sea.shake, 8);
    floatText(sh.x, sh.y - 20, '-' + dmg, '#ff6b6b');
    if (sh.hp <= 0) {
      sh.hp = 0;
      sh.sunk = 3;
      sh.v = 0;
      explosion(sh.x, sh.y, 50);
      addWreck(sh.x, sh.y);
      sh.cargo = {};
      S.doblones = Math.floor(S.doblones * 0.75);
      PV.UI.toast('¡Te hundieron! Perdiste la carga y parte del oro. Volvés a Isla Refugio…', 'bad');
    }
  }

  function respawn() {
    const S = PV.state, sh = S.ship, home = S.islands.find(i => i.home);
    sh.x = home.x + home.R + 140; sh.y = home.y; sh.a = 0; sh.v = 0;
    sh.hp = Sea.stats().maxHp; sh.sunk = 0;
    for (const e of Sea.enemies) e.aggro = false;
  }

  // ---------- Actualización ----------

  Sea.update = function (dt) {
    const S = PV.state, sh = S.ship, st = Sea.stats(), K = PV.Input.keys;

    if (sh.sunk > 0) {
      sh.sunk -= dt;
      if (sh.sunk <= 0) respawn();
    } else {
      const turn = (K.KeyA || K.ArrowLeft ? -1 : 0) + (K.KeyD || K.ArrowRight ? 1 : 0);
      if (K.KeyW || K.ArrowUp) sh.v += 110 * dt;
      else if (K.KeyS || K.ArrowDown) sh.v -= 150 * dt;
      else sh.v -= Math.sign(sh.v) * Math.min(Math.abs(sh.v), 15 * dt);
      sh.v = U.clamp(sh.v, -35, st.speed);
      sh.a += turn * dt * (0.7 + 1.1 * Math.min(1, Math.abs(sh.v) / 90));
      sh.x += Math.cos(sh.a) * sh.v * dt;
      sh.y += Math.sin(sh.a) * sh.v * dt;
      sh.x = U.clamp(sh.x, 60, Wd.SIZE - 60);
      sh.y = U.clamp(sh.y, 60, Wd.SIZE - 60);
      collide(sh, 20);
      sh.rl = Math.max(0, sh.rl - dt);
      sh.rr = Math.max(0, sh.rr - dt);

      if (Math.abs(sh.v) > 25 && Math.random() < 0.6) {
        puff(sh.x - Math.cos(sh.a) * 24, sh.y - Math.sin(sh.a) * 24, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 'rgba(255,255,255,0.5)', 1.2, 3 + Math.random() * 3);
      }
      reveal(sh.x, sh.y, REVEAL);
      checkZone(sh);

      // Reparación lenta cerca de islas propias.
      for (const isl of S.islands) {
        if (isl.owned && U.dist(sh.x, sh.y, isl.x, isl.y) < isl.R + 260) { sh.hp = Math.min(st.maxHp, sh.hp + 4 * dt); break; }
      }
    }

    // Isla o puerto cercano para interactuar.
    Sea.near = null;
    if (!(sh.sunk > 0)) {
      let best = 1e9;
      for (const isl of S.islands) {
        const d = U.dist(sh.x, sh.y, isl.x, isl.y) - Wd.radius(isl, Math.atan2(sh.y - isl.y, sh.x - isl.x));
        if (d < 90 && d < best) { best = d; Sea.near = isl; }
      }
    }

    Sea._dockT = (Sea._dockT || 0) - dt;
    if (Sea._dockT <= 0 && !(sh.sunk > 0)) {
      Sea._dockT = 1;
      for (const isl of S.islands) {
        if (!isl.owned || !isl.grid) continue;
        if (U.dist(sh.x, sh.y, isl.x, isl.y) > isl.R + 220) { isl._docked = false; continue; }
        // Lo marcado en el muelle se baja una sola vez, al llegar desde lejos.
        const r = PV.Island.dockSync(isl, !isl._docked);
        if (r.loaded || r.unloaded) {
          if (!isl._docked) PV.UI.toast(`Muelle de ${isl.name}: ${r.loaded} cargados, ${r.unloaded} descargados.`, 'good');
          else floatText(sh.x, sh.y - 30, `+${r.loaded} ⚓`, '#fff');
        }
        isl._docked = true;
      }
    }

    for (let i = Sea.enemies.length - 1; i >= 0; i--) updateEnemy(Sea.enemies[i], dt, sh);
    updateTowers(dt, sh);
    updateGuardRespawn(dt, sh);
    updateBullets(dt);
    updateFx(dt);
  };

  function updateEnemy(e, dt, sh) {
    const home = PV.state.islands[e.home];
    const alive = !(sh.sunk > 0);
    const d = U.dist(e.x, e.y, sh.x, sh.y);
    if (alive && d < 520) e.aggro = true;
    if (!alive || d > 1100 || U.dist(e.x, e.y, home.x, home.y) > home.R + 1300) e.aggro = false;

    let want;
    if (e.aggro) {
      const to = Math.atan2(sh.y - e.y, sh.x - e.x);
      if (d > 300) want = to;
      else want = to + (U.angDiff(e.a, to) > 0 ? 1 : -1) * Math.PI / 2; // ponerse de costado para disparar
      e.v = U.lerp(e.v, e.speed, dt);
    } else {
      e.pa += dt * 0.12;
      const pr = home.R + 190;
      want = Math.atan2(home.y + Math.sin(e.pa) * pr - e.y, home.x + Math.cos(e.pa) * pr - e.x);
      e.v = U.lerp(e.v, e.speed * 0.5, dt);
    }
    e.a += U.clamp(U.angDiff(want, e.a), -1.2 * dt, 1.2 * dt);
    e.x += Math.cos(e.a) * e.v * dt;
    e.y += Math.sin(e.a) * e.v * dt;
    collide(e, 20);

    e.rl -= dt; e.rr -= dt;
    if (e.aggro && alive && d < 400) {
      const rel = U.angDiff(Math.atan2(sh.y - e.y, sh.x - e.x), e.a);
      if (Math.abs(Math.abs(rel) - Math.PI / 2) < 0.4) {
        const side = rel > 0 ? 1 : -1, k = side > 0 ? 'rr' : 'rl';
        if (e[k] <= 0) { fire(e, side, e.guns, e.dmg, 'e'); e[k] = 3.2 - e.tier * 0.2; }
      }
    }
  }

  function updateTowers(dt, sh) {
    if (sh.sunk > 0) return;
    for (const isl of PV.state.islands) {
      if (isl.owned || !isl.towers.length || U.dist(isl.x, isl.y, sh.x, sh.y) > isl.R + 700) continue;
      for (const tw of isl.towers) {
        if (tw.hp <= 0) continue;
        tw.cd -= dt;
        const d = U.dist(tw.x, tw.y, sh.x, sh.y);
        if (d < 470 && tw.cd <= 0) {
          tw.cd = 2.6 - isl.tier * 0.15;
          const spd = 380, tt = d / spd;
          const tx = sh.x + Math.cos(sh.a) * sh.v * tt, ty = sh.y + Math.sin(sh.a) * sh.v * tt;
          const ang = Math.atan2(ty - tw.y, tx - tw.x) + (Math.random() - 0.5) * 0.08;
          Sea.bullets.push({ x: tw.x, y: tw.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: Math.min(1.5, tt + 0.25), o: 'e', dmg: 5 + isl.tier * 3 });
          for (let k = 0; k < 5; k++) puff(tw.x, tw.y, Math.cos(ang) * 50, Math.sin(ang) * 50, 'rgba(230,230,230,0.8)', 0.7, 6);
        }
      }
    }
  }

  function updateGuardRespawn(dt, sh) {
    for (const isl of PV.state.islands) {
      if (isl.owned || isl.port) continue;
      const need = D.TIERS[isl.tier].guards;
      if (!need || Sea.guardsAlive(isl) >= need) continue;
      isl._gt = (isl._gt === undefined ? 120 : isl._gt) - dt;
      if (isl._gt <= 0 && U.dist(sh.x, sh.y, isl.x, isl.y) > 900) {
        spawnGuard(isl, Math.random() * TAU);
        isl._gt = 120;
      }
    }
  }

  function updateBullets(dt) {
    const S = PV.state, sh = S.ship, B = Sea.bullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      if (b.o === 'p') {
        for (const e of Sea.enemies) {
          if (U.dist(b.x, b.y, e.x, e.y) < 22) { damageEnemy(e, b.dmg); hit = true; break; }
        }
        if (!hit) {
          for (const isl of S.islands) {
            if (isl.owned || !isl.towers.length || U.dist(b.x, b.y, isl.x, isl.y) > isl.R * 1.5) continue;
            for (const tw of isl.towers) {
              if (tw.hp > 0 && U.dist(b.x, b.y, tw.x, tw.y) < 20) { damageTower(isl, tw, b.dmg); hit = true; break; }
            }
            if (hit) break;
          }
        }
      } else if (!(sh.sunk > 0) && U.dist(b.x, b.y, sh.x, sh.y) < 22) {
        damagePlayer(b.dmg);
        hit = true;
      }
      if (hit) { explosion(b.x, b.y, 10); B.splice(i, 1); }
      else if (b.life <= 0) { splash(b.x, b.y); B.splice(i, 1); }
    }
  }

  function updateFx(dt) {
    for (let i = Sea.wrecks.length - 1; i >= 0; i--) if ((Sea.wrecks[i].life -= dt) <= 0) Sea.wrecks.splice(i, 1);
    for (let i = Sea.parts.length - 1; i >= 0; i--) {
      const p = Sea.parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
      if (p.life <= 0) Sea.parts.splice(i, 1);
    }
    for (let i = Sea.texts.length - 1; i >= 0; i--) {
      const t = Sea.texts[i];
      t.y -= 30 * dt; t.life -= dt;
      if (t.life <= 0) Sea.texts.splice(i, 1);
    }
    Sea.shake = Math.max(0, Sea.shake - 30 * dt);
  }

  // ---------- Interacción ----------

  Sea.interact = function () {
    const S = PV.state, isl = Sea.near;
    if (!isl || S.ship.sunk > 0) return;
    if (isl.port) return PV.Port.open(isl);
    if (isl.owned) return PV.Island.enter(isl);
    const t = Sea.towersAlive(isl), g = Sea.guardsAlive(isl);
    if (t > 0) return PV.UI.toast(`Quedan ${t} torres defendiendo la isla. ¡Destruilas con los cañones!`, 'bad');
    if (g > 0) return PV.UI.toast(`Hundí primero a ${g === 1 ? 'su barco guardián' : 'sus ' + g + ' barcos guardianes'}.`, 'bad');
    const cost = Sea.conquerCost(isl);
    if (S.doblones < cost) return PV.UI.toast(`Necesitás ${cost} doblones para fundar un fuerte.`, 'bad');
    S.doblones -= cost;
    isl.owned = true;
    PV.Island.ensureGrid(isl);
    PV.UI.toast(`¡${isl.name} ahora es tuya! Desembarcá con F.`, 'good');
    PV.Save.save();
  };

  Sea.onKey = function (code) {
    if (code === 'KeyQ') Sea.firePlayer(-1);
    else if (code === 'KeyE') Sea.firePlayer(1);
    else if (code === 'KeyF' || code === 'Enter') Sea.interact();
  };

  Sea.zoomBy = function (dy) {
    Sea.zoom = U.clamp(Sea.zoom * (dy < 0 ? 1.1 : 1 / 1.1), 0.55, 1.6);
  };

  // ---------- Dibujo ----------

  function islandPath(isl, k) {
    isl._p = isl._p || {};
    if (!isl._p[k]) {
      const p = new Path2D(), N = 72;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, r = Wd.radius(isl, a) * k;
        const x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
        if (i) p.lineTo(x, y); else p.moveTo(x, y);
      }
      p.closePath();
      isl._p[k] = p;
    }
    return isl._p[k];
  }

  function deco(isl) {
    if (!isl._deco) {
      const r = U.rng(isl.id * 977 + 5);
      isl._deco = [];
      const n = isl.port ? 3 : 8;
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, rr = Wd.radius(isl, a) * U.range(r, 0.25, 0.72);
        isl._deco.push({ x: isl.x + Math.cos(a) * rr, y: isl.y + Math.sin(a) * rr, rock: r() < 0.25, s: U.range(r, 0.8, 1.2) });
      }
    }
    return isl._deco;
  }

  function drawPalm(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x + 4, y + 4, 12 * s, 9 * s, 0, 0, TAU); ctx.fill();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      ctx.fillStyle = k % 2 ? '#2f7d32' : '#3c9a40';
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 7 * s, y + Math.sin(a) * 7 * s, 8 * s, 3.2 * s, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#6d4c2a';
    ctx.beginPath(); ctx.arc(x, y, 2.5 * s, 0, TAU); ctx.fill();
  }

  function drawFlag(ctx, x, y, t, color) {
    ctx.strokeStyle = '#3b2410'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x + i * 4, y - 34 + Math.sin(t * 5 + i) * 1.5);
    for (let i = 6; i >= 0; i--) ctx.lineTo(x + i * 4, y - 20 + Math.sin(t * 5 + i) * 1.5);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + 12, y - 27 + Math.sin(t * 5 + 3) * 1.5, 3, 0, TAU); ctx.fill();
  }

  function drawTown(ctx, isl) {
    const r = U.rng(isl.id * 31 + 7);
    // Muelle hacia el este
    const a = 0, cr = Wd.radius(isl, a);
    if (PV.Spr.draw(ctx, 'muelle', isl.x + cr + 14, isl.y + 30, 1.6)) { /* sprite */ } else {
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(isl.x + cr - 20, isl.y - 5, 60, 10);
    ctx.fillStyle = '#5a3a1e';
    for (let i = 0; i < 6; i++) ctx.fillRect(isl.x + cr - 18 + i * 10, isl.y - 5, 2, 10);
    }
    const roofs = ['#b03a2e', '#a04000', '#7d3c98', '#2471a3', '#b9770e'];
    for (let i = 0; i < 9; i++) {
      const hx = isl.x + U.range(r, -50, 45), hy = isl.y + U.range(r, -45, 45);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(hx + 3, hy + 3, 18, 14);
      ctx.fillStyle = '#efe0c0'; ctx.fillRect(hx, hy, 18, 14);
      ctx.fillStyle = roofs[i % roofs.length]; ctx.fillRect(hx - 1, hy - 1, 20, 7);
    }
  }

  function drawIsland(ctx, isl, t) {
    ctx.fillStyle = 'rgba(110,200,215,0.22)'; ctx.fill(islandPath(isl, 1.3));
    ctx.fillStyle = 'rgba(140,220,225,0.35)'; ctx.fill(islandPath(isl, 1.12));
    ctx.fillStyle = '#e6d29c'; ctx.fill(islandPath(isl, 1));
    ctx.fillStyle = isl.tier >= 4 ? '#4b7a3d' : isl.tier === 3 ? '#4f8f45' : '#58a24a'; ctx.fill(islandPath(isl, 0.85));
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fill(islandPath(isl, 0.55));

    for (const d of deco(isl)) {
      if (d.rock) {
        ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.arc(d.x, d.y, 7 * d.s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(d.x - 2, d.y - 2, 4 * d.s, 0, TAU); ctx.fill();
      } else drawPalm(ctx, d.x, d.y, d.s);
    }

    if (isl.port) drawTown(ctx, isl);
    if (isl.owned) {
      if (PV.Spr.draw(ctx, 'fuerte', isl.x, isl.y + 22, 1.5)) drawFlag(ctx, isl.x + 4, isl.y - 40, t, isl.home ? '#1e8449' : '#c0392b');
      else drawFlag(ctx, isl.x, isl.y, t, isl.home ? '#1e8449' : '#c0392b');
    } else if (!isl.port && (Sea.towersAlive(isl) || Sea.guardsAlive(isl))) {
      PV.Spr.draw(ctx, 'bandera', isl.x, isl.y + 14, 1.3);
    }
    if (isl.owned) {
      // Baterías de la isla, apuntando al atacante más cercano.
      for (const b of isl.buildings) {
        if (b.type !== 'bateria') continue;
        const [bx, by] = PV.Raid.batteryPos(isl, b);
        let a = Math.atan2(by - isl.y, bx - isl.x);
        const e = PV.Raid.ships().sort((p, q) => U.dist(bx, by, p.x, p.y) - U.dist(bx, by, q.x, q.y))[0];
        if (e && U.dist(bx, by, e.x, e.y) < D.RAID.battery.range) a = Math.atan2(e.y - by, e.x - bx);
        ctx.fillStyle = '#6d6458'; ctx.beginPath(); ctx.arc(bx, by, 9, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
        ctx.fillStyle = b.broken ? '#555' : '#1a1a1a'; ctx.fillRect(0, -2.5, 13, 5);
        ctx.restore();
      }
    }
    if (isl.owned && isl.buildings.length) {
      // Humito de la fábrica para mostrar que la isla produce
      ctx.fillStyle = 'rgba(80,80,80,0.35)';
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.6 + i / 3) % 1;
        ctx.beginPath(); ctx.arc(isl.x - 30 + ph * 10, isl.y + 20 - ph * 40, 4 + ph * 8, 0, TAU); ctx.fill();
      }
    }
  }

  function drawIslandLabel(ctx, isl) {
    if (!isl.explored) return;
    const y = isl.y - isl.R * 1.3 - 14;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px Georgia';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(isl.name, isl.x, y);
    ctx.fillStyle = '#fff8e1'; ctx.fillText(isl.name, isl.x, y);
    ctx.font = '13px Georgia';
    const sub = isl.port ? '⚓ Puerto · ' + Wd.zone(isl).n :'★'.repeat(isl.tier) + ' ' + D.TIERS[isl.tier].n + (isl.owned ? ' · tuya' : '');
    ctx.strokeText(sub, isl.x, y + 16);
    ctx.fillStyle = isl.port ? '#f4d03f' : D.TIERS[isl.tier].c; ctx.fillText(sub, isl.x, y + 16);
  }

  function drawTower(ctx, tw, sh) {
    if (tw.hp <= 0) {
      if (PV.Spr.draw(ctx, 'torre_rota', tw.x, tw.y + 16, 1.1)) return;
      ctx.fillStyle = '#4d4d4d'; ctx.beginPath(); ctx.arc(tw.x, tw.y, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(tw.x + 4, tw.y - 3, 5, 0, TAU); ctx.fill();
      return;
    }
    const a = Math.atan2(sh.y - tw.y, sh.x - tw.x);
    if (PV.Spr.draw(ctx, 'torre', tw.x, tw.y + 18, 1.2)) {
      // Cañón asomando arriba de la torre, apuntando al jugador
      ctx.save(); ctx.translate(tw.x, tw.y - 30); ctx.rotate(a);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, -3, 16, 6);
      ctx.restore();
      if (tw.hp < tw.max) hpBar(ctx, tw.x, tw.y - 50, tw.hp / tw.max);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(tw.x + 3, tw.y + 4, 17, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a8a8a'; ctx.beginPath(); ctx.arc(tw.x, tw.y, 17, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5d5d5d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#6e6e6e'; ctx.beginPath(); ctx.arc(tw.x, tw.y, 9, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(tw.x, tw.y); ctx.rotate(a);
    ctx.fillStyle = '#222'; ctx.fillRect(0, -3.5, 20, 7);
    ctx.restore();
    if (tw.hp < tw.max) hpBar(ctx, tw.x, tw.y - 28, tw.hp / tw.max);
  }

  function hpBar(ctx, x, y, f) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 20, y, 40, 5);
    ctx.fillStyle = f > 0.5 ? '#58d26b' : f > 0.25 ? '#f4d03f' : '#e74c3c';
    ctx.fillRect(x - 20, y, 40 * Math.max(0, f), 5);
  }

  function drawShip(ctx, o, sail, hull, guns, flag) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.a);
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.quadraticCurveTo(20, -12, 4, -12);
      ctx.lineTo(-22, -11); ctx.lineTo(-27, -6); ctx.lineTo(-27, 6); ctx.lineTo(-22, 11); ctx.lineTo(4, 12);
      ctx.quadraticCurveTo(20, 12, 30, 0);
      ctx.closePath();
    };
    ctx.save(); ctx.translate(4, 5); hullPath(); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); ctx.restore();
    hullPath(); ctx.fillStyle = hull; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#2e1a0a'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,160,0.25)';
    ctx.fillRect(-22, -7, 38, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for (let y = -4; y <= 4; y += 4) { ctx.beginPath(); ctx.moveTo(-22, y); ctx.lineTo(16, y); ctx.stroke(); }
    // Cañones
    ctx.fillStyle = '#151515';
    for (let i = 0; i < guns; i++) {
      const x = guns === 1 ? 0 : -14 + (i * 28) / (guns - 1);
      ctx.fillRect(x - 2, -15, 4, 4);
      ctx.fillRect(x - 2, 11, 4, 4);
    }
    // Velas (se inflan con la velocidad)
    const bulge = 3 + Math.min(1, Math.abs(o.v) / 150) * 7;
    for (const mx of [10, -9]) {
      ctx.fillStyle = sail;
      ctx.beginPath();
      ctx.moveTo(mx - 3, -20);
      ctx.lineTo(mx + 1, -20);
      ctx.quadraticCurveTo(mx + 8 + bulge * 2, 0, mx + 1, 20);
      ctx.lineTo(mx - 3, 20);
      ctx.quadraticCurveTo(mx - 2 + bulge, 0, mx - 3, -20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
      ctx.fillStyle = '#3b2410';
      ctx.beginPath(); ctx.arc(mx - 1, 0, 2.5, 0, TAU); ctx.fill();
    }
    if (flag) {
      ctx.fillStyle = flag;
      ctx.beginPath(); ctx.arc(-9 + bulge, 0, 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawWaves(ctx, x0, y0, x1, y1, t) {
    const c = 70;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let gy = Math.floor(y0 / c); gy <= y1 / c; gy++) {
      for (let gx = Math.floor(x0 / c); gx <= x1 / c; gx++) {
        const h = U.hash(gx, gy);
        if (h < 0.4) continue;
        const px = gx * c + h * 45 + Math.sin(t * 0.8 + h * 20) * 6;
        const py = gy * c + U.hash(gy, gx) * 45;
        ctx.moveTo(px - 9, py);
        ctx.quadraticCurveTo(px - 4.5, py - 5, px, py);
        ctx.quadraticCurveTo(px + 4.5, py - 5, px + 9, py);
      }
    }
    ctx.stroke();
  }

  function drawFog(ctx, x0, y0, x1, y1) {
    const c = Wd.FOG_CELL, n = Wd.FOG_N, f = PV.state.fog;
    ctx.fillStyle = '#0a1b29';
    for (let j = Math.max(0, Math.floor(y0 / c)); j <= Math.min(n - 1, y1 / c); j++) {
      for (let i = Math.max(0, Math.floor(x0 / c)); i <= Math.min(n - 1, x1 / c); i++) {
        if (!f[j * n + i]) ctx.fillRect(i * c - 1, j * c - 1, c + 2, c + 2);
      }
    }
    // Fuera del mapa
    ctx.fillStyle = '#06121c';
    const S = Wd.SIZE;
    if (x0 < 0) ctx.fillRect(x0, y0, -x0, y1 - y0);
    if (y0 < 0) ctx.fillRect(x0, y0, x1 - x0, -y0);
    if (x1 > S) ctx.fillRect(S, y0, x1 - S, y1 - y0);
    if (y1 > S) ctx.fillRect(x0, S, x1 - x0, y1 - S);
  }

  function drawMinimap(ctx) {
    const S = PV.state, s = 170, m = 12, x0 = PV.W - s - m, y0 = m, k = s / Wd.SIZE;
    const c = Wd.FOG_CELL, n = Wd.FOG_N;
    ctx.fillStyle = 'rgba(6,18,28,0.88)'; ctx.fillRect(x0, y0, s, s);
    const zg = Wd.zoneGrid();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (!S.fog[j * n + i]) continue;
      ctx.fillStyle = D.ZONES[zg[j * n + i]].mc;
      ctx.fillRect(x0 + i * c * k, y0 + j * c * k, c * k + 0.6, c * k + 0.6);
    }
    for (const isl of S.islands) {
      if (!isl.explored) continue;
      ctx.fillStyle = isl.port ? '#f4d03f' : D.TIERS[isl.tier].c;
      ctx.beginPath(); ctx.arc(x0 + isl.x * k, y0 + isl.y * k, Math.max(2.5, isl.R * k), 0, TAU); ctx.fill();
      if (isl.owned) { ctx.strokeStyle = '#7cfc00'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const cur = PV.Raid.st().cur;
    if (cur && PV.Raid.watched(S.islands[cur.isl])) {
      ctx.fillStyle = '#ff4d4d';
      for (const e of PV.Raid.ships()) { ctx.beginPath(); ctx.arc(x0 + e.x * k, y0 + e.y * k, 3, 0, TAU); ctx.fill(); }
      const ti = S.islands[cur.isl];
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x0 + ti.x * k, y0 + ti.y * k, ti.R * k + 5 + Math.sin(PV.time * 6) * 1.5, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#85c1e9';
    for (const m of PV.Fleet.list()) ctx.fillRect(x0 + m.x * k - 1.5, y0 + m.y * k - 1.5, 3, 3);
    ctx.fillStyle = '#82e0aa';
    for (const c of PV.Fleet.coast()) ctx.fillRect(x0 + c.x * k - 1.5, y0 + c.y * k - 1.5, 3, 3);
    const sh = S.ship;
    ctx.save(); ctx.translate(x0 + sh.x * k, y0 + sh.y * k); ctx.rotate(sh.a);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#c9a45c'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, s, s);
    // Nombre del mar donde estás, debajo del minimapa.
    ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
    const zn = D.ZONES[Wd.zoneAt(sh.x, sh.y)].n;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText('🧭 ' + zn, x0 + s / 2, y0 + s + 17);
    ctx.fillStyle = '#f3e2b8'; ctx.fillText('🧭 ' + zn, x0 + s / 2, y0 + s + 17);
  }

  // Cada mar tiene su color de agua, con una línea suave en el borde.
  function drawZones(ctx) {
    const sh = Wd.zoneShapes();
    for (const o of sh.outer) { ctx.fillStyle = D.ZONES[o.k].c; ctx.fill(o.p); }
    ctx.fillStyle = D.ZONES.mansas.c; ctx.fill(sh.inner);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 6; ctx.setLineDash([40, 30]);
    ctx.stroke(sh.inner);
    for (const l of sh.lines) ctx.stroke(l);
    ctx.restore();
  }

  Sea.drawBackdrop = function (ctx) {
    const t = PV.time;
    ctx.fillStyle = '#14507a'; ctx.fillRect(0, 0, PV.W, PV.H);
    ctx.save(); ctx.translate(-t * 12, -t * 5);
    drawWaves(ctx, t * 12 - 80, t * 5 - 80, t * 12 + PV.W + 80, t * 5 + PV.H + 80, t);
    ctx.restore();
  };

  Sea.render = function (ctx) {
    const S = PV.state, sh = S.ship, z = Sea.zoom, t = PV.time;
    const W = PV.W, H = PV.H;
    const camx = sh.x, camy = sh.y;
    const sx = (Math.random() - 0.5) * Sea.shake, sy = (Math.random() - 0.5) * Sea.shake;

    ctx.fillStyle = '#14507a'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(z, z); ctx.translate(-camx, -camy);
    const x0 = camx - W / 2 / z - 60, x1 = camx + W / 2 / z + 60, y0 = camy - H / 2 / z - 60, y1 = camy + H / 2 / z + 60;

    drawZones(ctx);
    drawWaves(ctx, x0, y0, x1, y1, t);
    const vis = S.islands.filter(i => i.x + i.R * 1.5 > x0 && i.x - i.R * 1.5 < x1 && i.y + i.R * 1.5 > y0 && i.y - i.R * 1.5 < y1);
    for (const isl of vis) drawIsland(ctx, isl, t);
    for (const isl of vis) for (const tw of isl.towers) if (!isl.owned) drawTower(ctx, tw, sh);

    for (const w of Sea.wrecks) PV.Spr.draw(ctx, 'naufragio', w.x, w.y + 18, 1.1, Math.min(1, w.life / 5) * 0.9);

    for (const p of Sea.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - (p.life / p.max) * 0.4), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const e of Sea.enemies) {
      if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
      drawShip(ctx, e, e.raid ? '#7b1414' : '#2b2b2b', '#4a3020', e.guns, '#f5f5f5');
      if (e.hp < e.max) hpBar(ctx, e.x, e.y - 34, e.hp / e.max);
    }
    ctx.textAlign = 'center'; ctx.font = '12px Georgia';
    for (const m of PV.Fleet.list()) {
      if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
      drawShip(ctx, m, '#f3e2b8', '#6e4a26', 1, '#2471a3');
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(m.name, m.x, m.y - 30);
      ctx.fillStyle = '#d6eaf8'; ctx.fillText(m.name, m.x, m.y - 30);
    }
    // Balandras de cabotaje: más chicas, vela verde clara.
    for (const c of PV.Fleet.coast()) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(0.8, 0.8); ctx.translate(-c.x, -c.y);
      drawShip(ctx, c, '#d5f5e3', '#7a5a34', 0, '#1e8449');
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(c.name, c.x, c.y - 26);
      ctx.fillStyle = '#d5f5e3'; ctx.fillText(c.name, c.x, c.y - 26);
    }
    if (!(sh.sunk > 0)) drawShip(ctx, sh, '#fbf6e9', '#8a5a2b', Sea.stats().guns, '#c0392b');

    ctx.fillStyle = '#111';
    for (const b of Sea.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, TAU); ctx.fill(); }

    ctx.textAlign = 'center'; ctx.font = 'bold 15px Georgia';
    for (const tx of Sea.texts) {
      ctx.globalAlpha = Math.min(1, tx.life * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(tx.t, tx.x, tx.y);
      ctx.fillStyle = tx.c; ctx.fillText(tx.t, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    drawFog(ctx, x0, y0, x1, y1);
    for (const isl of vis) drawIslandLabel(ctx, isl);
    ctx.restore();

    // Noche: se ven las luces de tus islas, los puertos y los faroles de los barcos.
    const toScr = (wx, wy, r) => [(wx - camx) * z + W / 2, (wy - camy) * z + H / 2, r * z];
    const lights = [];
    for (const isl of vis) if (isl.owned || isl.port) lights.push(toScr(isl.x, isl.y, isl.R * (isl.port ? 1.6 : 1.3)));
    if (!(sh.sunk > 0)) lights.push(toScr(sh.x, sh.y, 110));
    for (const m of PV.Fleet.list().concat(PV.Fleet.coast())) lights.push(toScr(m.x, m.y, 60));
    PV.Colony.drawNight(ctx, lights);

    drawMinimap(ctx);
  };

  PV.Sea = Sea;
})(window.PV);
