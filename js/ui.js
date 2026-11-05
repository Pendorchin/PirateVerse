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
    island: [[['1', '5'], 'elegir edificio'], [['R'], 'rotar'], [['Clic'], 'construir (arrastrá cintas)'], [['Clic der.'], 'quitar'],
      [['W', 'A', 'S', 'D'], 'cámara'], [['Rueda'], 'zoom'], [['Esc'], 'zarpar']],
  };
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
      else if (b.dataset.act === 'load') PV.Island.transfer(true);
      else if (b.dataset.act === 'unload') PV.Island.transfer(false);
    });

    $('portPanel').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && !b.disabled) PV.Port.action(b);
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
    $('help').innerHTML = helpHtml(HELP[s] || []);
    $('quest').classList.toggle('island', s === 'island');
    if (s === 'menu') show('quest', false);
    if (s === 'menu') $('btnContinue').disabled = !PV.Save.has();
    tick = 1;
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
      <div class="lbl"><i class="crate"></i> Bodega ${PV.Inv.cargoTotal()} / ${st.cap}</div>
      <div class="chips">${PV.Inv.chips(sh.cargo)}</div>`;
  }

  function islandInfo() {
    const isl = PV.Island.cur, Inv = PV.Inv;
    if (!isl) return '';
    const cap = Inv.storageCap(isl);
    return `<h3>${isl.name}</h3>
      <div class="sub">${isl.home ? 'Tu isla inicial' : '★'.repeat(isl.tier) + ' ' + D.TIERS[isl.tier].n} · <i class="coin"></i> ${U.fmt(PV.state.doblones)}</div>
      <div class="lbl"><i class="crate"></i> Almacén ${Inv.storageTotal(isl)} / ${cap}</div>
      ${cap ? '' : '<div class="muted">Construí un almacén (<kbd>3</kbd>) para guardar lo que producís.</div>'}
      <div class="chips">${Inv.chips(isl.storage)}</div>
      <div class="lbl"><i class="crate"></i> Bodega del barco ${Inv.cargoTotal()} / ${Inv.cargoCap()}</div>
      <div class="chips">${Inv.chips(PV.state.ship.cargo)}</div>`;
  }

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
      $('islandInfo').innerHTML = islandInfo();
      document.querySelectorAll('#buildbar small[data-cost]').forEach(el => {
        el.innerHTML = PV.Inv.costHtml(D.BUILD[el.dataset.cost].cost, PV.Island.cur);
      });
    }
  };

  PV.UI = UI;
})(window.PV);
