// Interfaz HTML: HUD, avisos, barra de construcción, panel de isla y menú.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D;
  const $ = id => document.getElementById(id);
  const UI = {};
  let tick = 0, lastToast = '', lastToastT = 0;

  // Atajos visibles: [teclas, descripción]
  const HELP = {
    sea: [[['W', 'S'], 'velas'], [['A', 'D'], 'timón'], [['Q'], 'cañones babor'], [['E'], 'cañones estribor'], [['F'], 'interactuar'], [['Rueda'], 'zoom']],
    port: [[['Esc'], 'zarpar']],
    island: [[['1', '0'], 'edificios'], [['M'], 'muelle'], [['R'], 'rotar'], [['Clic'], 'construir · elegir receta'], [['Clic der.'], 'quitar'],
      [['W', 'A', 'S', 'D'], 'cámara'], [['Rueda'], 'zoom'], [['Esc'], 'zarpar']],
  };
  const resName = k => D.RES[k].n;
  const helpHtml = list => list.map(([keys, label]) => `<span>${keys.map(k => `<kbd>${k}</kbd>`).join(keys.length === 2 && keys[0] === '1' ? '–' : '')} ${label}</span>`).join('');

  UI.init = function () {
    $('btnNew').onclick = () => {
      if (PV.Save.has() && !confirm('¿Empezar una partida nueva? Se pierde la guardada.')) return;
      PV.newGame();
    };
    $('btnContinue').onclick = () => PV.continueGame();
    $('btnContinue').disabled = !PV.Save.has();

    $('islandPanel').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'leave') PV.Island.leave();
      else if (b.dataset.act === 'unload') PV.Island.transfer(false);
      else if (b.dataset.act === 'ld' || b.dataset.act === 'ul') {
        PV.Island.move(b.dataset.k, b.dataset.n === 'all' ? Infinity : +b.dataset.n, b.dataset.act === 'ld');
        lastInfo = '';
      }
    });

    $('portPanel').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && !b.disabled) PV.Port.action(b);
    });

    $('chooser').addEventListener('click', e => {
      const el = e.target.closest('button');
      if (el) pick(el.dataset.v);
    });

    const bar = $('buildbar');
    bar.innerHTML = Object.keys(D.BUILD).map(k => {
      const d = D.BUILD[k];
      return `<button data-b="${k}" title="${d.desc}"><b>${d.k}</b><img class="ic" alt="" src="${PV.Island.thumb(k)}">${d.n}<small data-cost="${k}"></small></button>`;
    }).join('');
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) PV.Island.select(b.dataset.b);
    });
  };

  UI.onScene = function (s) {
    const show = (id, on) => $(id).classList.toggle('hidden', !on);
    show('menu', s === 'menu');
    show('hud', s === 'sea' || s === 'port');
    show('prompt', false);
    show('help', s !== 'menu');
    show('islandPanel', s === 'island');
    show('buildbar', s === 'island');
    show('portPanel', s === 'port');
    show('tooltip', false);
    UI.closeChooser();
    $('help').innerHTML = helpHtml(HELP[s] || []);
    $('quest').classList.toggle('island', s === 'island');
    if (s === 'menu') show('quest', false);
    if (s === 'menu') $('btnContinue').disabled = !PV.Save.has();
    tick = 1;
  };

  // ---------- Panel para elegir receta / filtro / descarga ----------

  let chooseB = null;
  const RES_KEYS = () => Object.keys(D.RES);
  const opt = (v, label, on, color) =>
    `<button data-v="${v}" class="${on ? 'on' : ''}">${color ? `<i class="dot" style="background:${color}"></i>` : ''}${label}</button>`;
  const resOpts = (isOn) => RES_KEYS().map(k => opt(k, resName(k), isOn(k), D.RES[k].c)).join('');

  UI.CHOOSE = {
    clasificador: b => ({ title: '🧭 Capataz: ¿qué sigue derecho?', sub: 'Lo demás sale por los costados.',
      html: opt('', 'Todo', !b.filter) + resOpts(k => b.filter === k) }),
    insertador: b => ({ title: '💪 Estibador: ¿qué agarra?', sub: 'Solo lleva lo que el de adelante acepta.',
      html: opt('', 'Cualquier cosa', !b.filter) + resOpts(k => b.filter === k) }),
    herreria: b => ({ title: '⚒️ Herrería: receta', sub: '',
      html: Object.keys(D.RECIPES.herreria).map(k => opt(k, PV.Island.recipeTxt(D.RECIPES.herreria[k]), b.recipe === k)).join('') }),
    taller: b => ({ title: '🧵 Taller: receta', sub: '',
      html: Object.keys(D.RECIPES.taller).map(k => opt(k, PV.Island.recipeTxt(D.RECIPES.taller[k]), b.recipe === k)).join('') }),
    muelle: b => ({ title: '⚓ Muelle: al llegar, bajar del barco…', sub: 'Lo que marques se baja solo al almacén una vez, cuando llegás a la isla o desembarcás. Lo que cargues a mano después no se toca. (Lo que traen los senderos al muelle se sube solo al barco.)',
      html: resOpts(k => b.unload.includes(k)), multi: true }),
  };

  function pick(v) {
    const b = chooseB;
    if (!b) return;
    if (v === '__close') return UI.closeChooser();
    if (b.type === 'muelle') {
      const i = b.unload.indexOf(v);
      if (i >= 0) b.unload.splice(i, 1); else b.unload.push(v);
      renderChooser();
      return;
    }
    if (b.recipe !== undefined) {
      if (b.recipe !== v) {
        // Lo que tenía para la receta vieja vuelve al almacén.
        const isl = PV.Island.cur;
        for (const k in b.inv) PV.Inv.add(isl.storage, k, b.inv[k]);
        b.inv = {}; b.prog = 0; b.recipe = v;
      }
    } else b.filter = v || null;
    UI.closeChooser();
  }

  function renderChooser() {
    const c = UI.CHOOSE[chooseB.type](chooseB);
    $('chooser').innerHTML = `<h4>${c.title}</h4>${c.sub ? `<div class="sub">${c.sub}</div>` : ''}<div class="opts ${c.multi || chooseB.recipe === undefined ? 'grid' : ''}">${c.html}</div>
      <button data-v="__close" class="close">Listo</button>`;
  }

  UI.chooser = function (b, mx, my) {
    chooseB = b;
    renderChooser();
    const el = $('chooser');
    el.classList.remove('hidden');
    el.style.left = Math.max(8, Math.min(mx + 12, PV.W - el.offsetWidth - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(my - 20, PV.H - el.offsetHeight - 60)) + 'px';
  };

  UI.closeChooser = function () {
    chooseB = null;
    $('chooser').classList.add('hidden');
  };

  UI.toast = function (msg, kind) {
    const now = performance.now();
    if (msg === lastToast && now - lastToastT < 1500) return;
    lastToast = msg; lastToastT = now;
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 3800);
  };

  function seaPrompt() {
    const isl = PV.Sea.near;
    if (!isl) return '';
    const key = '<kbd>F</kbd>';
    if (isl.port) return `${key} Entrar a <b>${isl.name}</b>`;
    if (isl.owned) return `${key} Desembarcar en <b>${isl.name}</b>`;
    const res = PV.Sea.islandRes(isl).map(k => D.RES[k].n).join(', ');
    const t = PV.Sea.towersAlive(isl), g = PV.Sea.guardsAlive(isl);
    let line;
    if (t || g) line = `⚔️ Defensas: ${t} torres, ${g} barcos guardianes`;
    else line = `${key} Fundar fuerte y reclamar la isla (${PV.Sea.conquerCost(isl)} <i class="coin"></i>)`;
    return `<b>${isl.name}</b> · ${'★'.repeat(isl.tier)} ${D.TIERS[isl.tier].n}<br>Recursos: ${res}<br>${line}`;
  }

  function ammoTxt(cargo) {
    const have = D.AMMO.filter(a => cargo[a.k]).map(a => `${cargo[a.k]} ${resName(a.k).toLowerCase()}`);
    return have.length ? have.join(', ') : '<span class="muted">metralla común</span>';
  }

  function stats() {
    const S = PV.state, sh = S.ship, st = PV.Sea.stats();
    const hp = Math.max(0, sh.hp) / st.maxHp;
    const rl = 1 - (sh.rl || 0) / st.reload, rr = 1 - (sh.rr || 0) / st.reload;
    return `<div class="gold"><i class="coin"></i> ${U.fmt(S.doblones)} doblones</div>
      <div class="bar"><div style="width:${hp * 100}%"></div><span><i class="heart"></i> Casco ${Math.ceil(Math.max(0, sh.hp))} / ${st.maxHp}</span></div>
      <div class="reloads">
        <div class="bar reload"><div style="width:${rl * 100}%"></div><span>${rl >= 1 ? '● ' : ''}Q Babor</span></div>
        <div class="bar reload"><div style="width:${rr * 100}%"></div><span>${rr >= 1 ? '● ' : ''}E Estribor</span></div>
      </div>
      <div class="lbl">💣 Munición: ${ammoTxt(sh.cargo)}</div>
      <div class="lbl"><i class="crate"></i> Bodega ${PV.Inv.cargoTotal()} / ${st.cap}</div>
      <div class="chips">${PV.Inv.chips(sh.cargo)}</div>`;
  }

  function islandInfo() {
    const isl = PV.Island.cur, Inv = PV.Inv;
    if (!isl) return '';
    const cap = Inv.storageCap(isl), cargo = PV.state.ship.cargo;
    return `<h3>${isl.name}</h3>
      <div class="sub">${isl.home ? 'Tu isla inicial' : '★'.repeat(isl.tier) + ' ' + D.TIERS[isl.tier].n} · <i class="coin"></i> ${U.fmt(PV.state.doblones)}</div>
      <div class="lbl"><i class="crate"></i> Almacén ${Inv.storageTotal(isl)} / ${cap} <span class="muted">· subir al barco</span></div>
      ${cap ? '' : '<div class="muted">Construí un almacén (<kbd>4</kbd>) para guardar lo que producís.</div>'}
      ${invRows(isl.storage, 'ld', '⬆')}
      <div class="lbl"><i class="crate"></i> Bodega del barco ${Inv.cargoTotal()} / ${Inv.cargoCap()} <span class="muted">· bajar a la isla</span></div>
      ${invRows(cargo, 'ul', '⬇')}`;
  }

  // Una fila por recurso con botones para mover 10 o todo.
  function invRows(bag, act, arrow) {
    const keys = Object.keys(bag).sort((a, b) => bag[b] - bag[a]);
    if (!keys.length) return '<div class="muted">vacío</div>';
    return '<div class="invrows">' + keys.map(k => `<div class="invrow"><i style="background:${D.RES[k].c}"></i><span>${resName(k)}</span><b>${bag[k]}</b>
      <button data-act="${act}" data-k="${k}" data-n="10">${arrow} 10</button><button data-act="${act}" data-k="${k}" data-n="all">${arrow} todo</button></div>`).join('') + '</div>';
  }
  let lastInfo = '';

  UI.update = function (dt) {
    const s = PV.scene;
    if (s === 'island') {
      const tip = PV.Island.tooltip(), el = $('tooltip');
      el.classList.toggle('hidden', !tip);
      if (tip) {
        el.innerHTML = tip;
        el.style.left = Math.min(PV.Input.mx + 18, PV.W - 270) + 'px';
        el.style.top = (PV.Input.my + 18) + 'px';
      }
      document.querySelectorAll('#buildbar button').forEach(b => b.classList.toggle('sel', b.dataset.b === PV.Island.sel));
    }

    tick -= dt;
    if (tick > 0) return;
    tick = 0.15;

    if (s === 'sea' || s === 'port') $('stats').innerHTML = stats();
    if (s === 'sea') {
      const p = seaPrompt();
      $('prompt').classList.toggle('hidden', !p);
      if (p) $('prompt').innerHTML = p;
    }
    if (s !== 'menu') PV.Tutorial.update();
    if (s === 'island') {
      // Solo se redibuja si cambió, para no perder clics en los botones.
      const info = islandInfo();
      if (info !== lastInfo) { $('islandInfo').innerHTML = info; lastInfo = info; }
      document.querySelectorAll('#buildbar small[data-cost]').forEach(el => {
        el.innerHTML = PV.Inv.costHtml(D.BUILD[el.dataset.cost].cost, PV.Island.cur);
      });
    }
  };

  PV.UI = UI;
})(window.PV);
