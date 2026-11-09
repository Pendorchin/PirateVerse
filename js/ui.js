// Interfaz HTML: HUD, avisos, barra de construcción, panel de isla y menú.
(function (PV) {
  'use strict';
  const U = PV.U, D = PV.D;
  const $ = id => document.getElementById(id);
  const UI = {};
  let tick = 0, lastToast = '', lastToastT = 0;

  // Atajos visibles: [teclas, descripción]
  const HELP = {
    sea: [[['I'], 'investigación'], [['W', 'S'], 'velas'], [['A', 'D'], 'timón'], [['Q'], 'cañones babor'], [['E'], 'cañones estribor'], [['F'], 'interactuar'], [['Rueda'], 'zoom']],
    port: [[['Esc'], 'zarpar']],
    island: [[['1', '0'], 'edificios'], [['M'], 'muelle'], [['C'], 'cartógrafo'], [['B'], 'banquero'], [['T'], 'taberna'], [['G', 'K'], 'defensas'], [['I'], 'investigación'], [['R'], 'rotar'], [['Clic'], 'construir · elegir receta'], [['Clic der.'], 'quitar'],
      [['W', 'A', 'S', 'D'], 'cámara'], [['Rueda'], 'zoom'], [['Esc'], 'zarpar']],
  };
  const resName = k => D.RES[k].n;
  const helpHtml = list => list.map(([keys, label]) => `<span>${keys.map(k => `<kbd>${k}</kbd>`).join(keys.length === 2 && ['1', 'G'].includes(keys[0]) ? '–' : '')} ${label}</span>`).join('');

  // Caja de la nube en el menú: iniciar o cerrar sesión, y cómo está la sincronización.
  UI.cloudChanged = function () {
    const C = PV.Cloud, box = $('cloudBox');
    if (!box) return;
    const st = C.status ? `<div class="cloud-st">${C.status}</div>` : '';
    if (!PV.Transfer.isWeb()) box.innerHTML = '';
    else if (!C.ready) box.innerHTML = st || '<div class="cloud-st">Conectando con la nube…</div>';
    else if (!C.user) box.innerHTML = `<button data-cloud="in">☁️ Iniciar sesión con Google</button><div class="cloud-st">Para tener la misma partida en cualquier compu.</div>${st}`;
    else box.innerHTML = `<div class="cloud-st">☁️ Conectado como <b>${String(C.user.name).replace(/[<>&"]/g, c => '&#' + c.charCodeAt(0) + ';')}</b> · <a href="#" data-cloud="out" role="button">cerrar sesión</a></div>${st}`;
    box.querySelectorAll('a[data-cloud]').forEach(a => a.onclick = e => { e.preventDefault(); PV.Cloud.signOut(); });
    $('btnContinue').disabled = !PV.Save.has();
  };

  UI.init = function () {
    $('btnNew').onclick = () => {
      if (PV.Save.has() && !confirm('¿Empezar una partida nueva? Se pierde la guardada.')) return;
      $('diffPick').classList.remove('hidden');
    };
    document.querySelectorAll('#diffPick button').forEach(b => {
      const d = D.DIFFS[b.dataset.diff];
      b.innerHTML = `<b>${d.n}</b><small>${d.desc}</small>`;
      b.onclick = () => { $('diffPick').classList.add('hidden'); $('tutAsk').classList.remove('hidden'); $('tutAsk').dataset.diff = b.dataset.diff; };
    });
    document.querySelectorAll('#tutAsk button').forEach(b => b.onclick = () => {
      $('tutAsk').classList.add('hidden');
      PV.newGame($('tutAsk').dataset.diff, b.dataset.tut === '1');
    });
    $('btnContinue').onclick = () => PV.continueGame();
    $('cloudBox').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && b.dataset.cloud === 'in') PV.Cloud.signIn();
      if (b && b.dataset.cloud === 'out') PV.Cloud.signOut();
    });
    UI.cloudChanged();
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

    $('research').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'close') return UI.closeResearch();
      if (b.dataset.t) { PV.Tech.start(b.dataset.t); UI.renderResearch(); }
    });

    $('bank').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const isl = PV.Island.cur, a = b.dataset.act, n = b.dataset.n === 'all' ? Infinity : +b.dataset.n;
      if (a === 'close') return UI.closeBank();
      if (a === 'dep') PV.Bank.deposit(isl, n === Infinity ? PV.state.doblones : n);
      else if (a === 'wd') PV.Bank.withdraw(isl, n === Infinity ? PV.Bank.of(isl).saved : n);
      else if (a === 'inv') PV.Bank.invest(isl, b.dataset.k, n);
      UI.renderBank();
    });

    $('chooser').addEventListener('click', e => {
      const el = e.target.closest('button');
      if (el) pick(el.dataset.v);
    });

    const bar = $('buildbar');
    $('buildcats').innerHTML = D.BUILD_CATS.map(c => `<button data-cat="${c.k}">${c.icon} ${c.n}</button>`).join('');
    $('buildcats').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) UI.setCat(b.dataset.cat);
    });
    bar.innerHTML = Object.keys(D.BUILD).map(k => {
      const d = D.BUILD[k];
      return `<button data-b="${k}" data-cat="${d.cat}" title="${d.desc}"><b>${d.k}</b><img class="ic" alt="" src="${PV.Island.thumb(k)}">${d.n}<small data-cost="${k}"></small></button>`;
    }).join('');
    // Con muchos edificios la barra se desplaza con la rueda.
    bar.addEventListener('wheel', e => {
      if (bar.scrollWidth <= bar.clientWidth) return;
      bar.scrollLeft += e.deltaY + e.deltaX;
      e.preventDefault(); e.stopPropagation();
    }, { passive: false });
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) PV.Island.select(b.dataset.b);
    });
  };

  // Pestaña del menú de construcción (también cambia sola al elegir con una tecla).
  UI.cat = 'rec';
  UI.setCat = function (c) {
    UI.cat = c;
    document.querySelectorAll('#buildcats button').forEach(b => b.classList.toggle('on', b.dataset.cat === c));
    document.querySelectorAll('#buildbar button').forEach(b => b.classList.toggle('offcat', b.dataset.cat !== c));
    $('buildbar').scrollLeft = 0;
  };

  UI.onScene = function (s) {
    const show = (id, on) => $(id).classList.toggle('hidden', !on);
    show('menu', s === 'menu');
    show('moveBanner', s === 'menu' && !PV.Transfer.isWeb()); // cartel de mudanza solo en el menú del artifact
    if (s !== 'menu') PV.Transfer.close();
    show('hud', s === 'sea' || s === 'port');
    show('prompt', false);
    show('help', s !== 'menu');
    show('islandPanel', s === 'island');
    show('buildbar', s === 'island');
    show('buildcats', s === 'island');
    if (s === 'island') UI.setCat(UI.cat);
    show('portPanel', s === 'port');
    show('tooltip', false);
    UI.closeChooser();
    UI.closeResearch();
    UI.closeBank();
    $('help').innerHTML = helpHtml(HELP[s] || []);
    $('quest').classList.toggle('island', s === 'island');
    if (s === 'menu') { show('quest', false); show('tutBtn', false); }
    if (s === 'menu') $('btnContinue').disabled = !PV.Save.has();
    tick = 1;
  };

  // ---------- Panel para elegir receta / filtro / descarga ----------

  let chooseB = null;
  const RES_KEYS = () => Object.keys(D.RES);
  const opt = (v, label, on, color, lock) =>
    `<button data-v="${v}" class="${on ? 'on' : ''}" ${lock ? `disabled title="Investigá «${D.TECH[lock].n}»"` : ''}>${color ? `<i class="dot" style="background:${color}"></i>` : ''}${lock ? '🔒 ' : ''}${label}</button>`;
  const recipeOpts = (type, b) => Object.keys(D.RECIPES[type]).map(k => opt(k, PV.Island.recipeTxt(D.RECIPES[type][k]), b.recipe === k, null, PV.Tech.recipeLocked(type, k))).join('');
  const resOpts = (isOn) => RES_KEYS().map(k => opt(k, resName(k), isOn(k), D.RES[k].c)).join('');

  UI.CHOOSE = {
    clasificador: b => ({ title: '🧭 Capataz: ¿qué sigue derecho?', sub: 'Lo demás sale por los costados.',
      html: opt('', 'Todo', !b.filter) + resOpts(k => b.filter === k) }),
    insertador: b => ({ title: '💪 Estibador: ¿qué agarra?', sub: 'Solo lleva lo que el de adelante acepta.',
      html: opt('', 'Cualquier cosa', !b.filter) + resOpts(k => b.filter === k) }),
    herreria: b => ({ title: `${D.BUILD[b.type].icon} ${D.BUILD[b.type].n}: receta`, sub: '',
      html: recipeOpts(b.type, b) }),
    taller: b => ({ title: `${D.BUILD[b.type].icon} ${D.BUILD[b.type].n}: receta`, sub: '',
      html: recipeOpts(b.type, b) }),
    destileria: b => ({ title: `${D.BUILD[b.type].icon} ${D.BUILD[b.type].n}: receta`, sub: 'La caña fina crece en islas ★★ y ★★★.',
      html: recipeOpts(b.type, b) }),
    muelle: b => ({ title: '⚓ Muelle: al llegar, bajar del barco…', sub: 'Lo que marques se baja solo al almacén una vez, cuando llegás a la isla o desembarcás. Lo que cargues a mano después no se toca. (Lo que traen los senderos al muelle se sube solo al barco.)',
      html: resOpts(k => b.unload.includes(k)), multi: true }),
  };

  function pick(v) {
    const b = chooseB;
    if (!b) return;
    if (v === '__close') return UI.closeChooser();
    if (D.base(b.type) === 'muelle') {
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
    const c = UI.CHOOSE[D.base(chooseB.type)](chooseB);
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
    const banked = PV.Bank.total();
    return `<div class="gold"><i class="coin"></i> ${U.fmt(S.doblones)} doblones${banked >= 1 ? ` <span class="muted" style="font-size:12px">· 🏦 ${U.fmt(Math.floor(banked))}</span>` : ''}</div>
      <div class="bar"><div style="width:${hp * 100}%"></div><span><i class="heart"></i> Casco ${Math.ceil(Math.max(0, sh.hp))} / ${st.maxHp}</span></div>
      <div class="reloads">
        <div class="bar reload"><div style="width:${rl * 100}%"></div><span>${rl >= 1 ? '● ' : ''}Q Babor</span></div>
        <div class="bar reload"><div style="width:${rr * 100}%"></div><span>${rr >= 1 ? '● ' : ''}E Estribor</span></div>
      </div>
      <div class="lbl">💣 Munición: ${ammoTxt(sh.cargo)}</div>
      ${researchLine()}
      ${PV.Colony.crewLine()}
      <div class="lbl"><i class="crate"></i> Bodega ${PV.Inv.cargoTotal()} / ${st.cap}</div>
      <div class="chips">${PV.Inv.chips(sh.cargo)}</div>`;
  }

  function islandInfo() {
    const isl = PV.Island.cur, Inv = PV.Inv;
    if (!isl) return '';
    const cap = Inv.storageCap(isl), cargo = PV.state.ship.cargo;
    return researchLine() + `<h3>${isl.name}</h3>
      <div class="sub">${isl.home ? 'Tu isla inicial' : '★'.repeat(isl.tier) + ' ' + D.TIERS[isl.tier].n} · <i class="coin"></i> ${U.fmt(PV.state.doblones)}</div>
      <div class="lbl"><i class="crate"></i> Almacén ${Inv.storageTotal(isl)} / ${cap} <span class="muted">· subir al barco</span></div>
      ${PV.Colony.islandLine(isl)}
      ${cap ? '' : '<div class="muted">Construí un almacén (<kbd>4</kbd>) para guardar lo que producís.</div>'}
      ${invRows(isl.storage, 'ld', '⬆')}
      <div class="lbl"><i class="crate"></i> Bodega del barco ${Inv.cargoTotal()} / ${Inv.cargoCap()} <span class="muted">· bajar a la isla</span></div>
      ${invRows(cargo, 'ul', '⬇')}`;
  }

  function researchLine() {
    const r = PV.Tech.st(), cur = r && r.cur;
    return `<div class="lbl research-line">🗺️ ${cur ? `Investigando: <b>${D.TECH[cur].n}</b> ${Math.round(PV.Tech.progress(cur) * 100)}%` : '<span class="muted">Sin investigación</span>'} <kbd>I</kbd></div>`;
  }

  // ---------- Banco ----------

  UI.bankOpen = () => !$('bank').classList.contains('hidden');
  UI.openBank = function () { UI.closeChooser(); UI.closeResearch(); $('bank').classList.remove('hidden'); UI.renderBank(); };
  UI.closeBank = function () { $('bank').classList.add('hidden'); };

  UI.renderBank = function () {
    const isl = PV.Island.cur;
    if (!isl) return UI.closeBank();
    const S = PV.state, bk = PV.Bank.of(isl), saved = Math.floor(bk.saved), dob = S.doblones;
    const btn = (act, n, label, ok) => `<button data-act="${act}" data-n="${n}" ${ok ? '' : 'disabled'}>${label}</button>`;
    const lockInv = PV.Tech.lockOf('feature', 'inversiones');
    const inv = lockInv
      ? `<p class="muted">🔒 Investigá «${D.TECH[lockInv].n}» para invertir con riesgo.</p>`
      : Object.keys(D.BANK.INVEST).filter(k => !D.BANK.INVEST[k].big || PV.Bank.big(isl)).map(k => {
          const o = D.BANK.INVEST[k];
          return `<div class="binv"><div><b>${o.icon} ${o.n}</b><div class="sub">${o.desc}<br>${Math.round(o.p * 100)}% de salir bien: +${Math.round(o.win * 100)}% · si sale mal: −${Math.round(o.lose * 100)}% · ${Math.round(o.t / 60)} min</div></div>
            <div>${[100, 500, 2000].map(n => `<button data-act="inv" data-k="${k}" data-n="${n}" ${dob >= n ? '' : 'disabled'}>${U.fmt(n)}</button>`).join('')}</div></div>`;
        }).join('');
    const running = bk.inv.length ? '<div class="lbl">En curso</div>' + bk.inv.map(it => {
      const o = D.BANK.INVEST[it.k];
      return `<div class="binv run">${o.icon} ${o.n}: <b>${U.fmt(it.amt)}</b> <span class="muted">· vuelve en ${Math.floor(it.t / 60)}:${String(Math.floor(it.t % 60)).padStart(2, '0')}</span></div>`;
    }).join('') : '';
    $('bank').innerHTML = `<div class="rhead"><h2>🏦 Banquero de ${isl.name}</h2><button data-act="close">Cerrar (Esc)</button></div>
      <p class="muted">Lo guardado acá no se pierde si te hunden y gana <b>${(PV.Bank.rate(isl) * 100).toFixed(1).replace('.', ',')}% por minuto</b> (hasta ${U.fmt(PV.Bank.cap(isl))} doblones). Ojo: si los piratas saquean esta isla, se llevan una parte.</p>
      <div class="bsum"><div><i class="coin"></i> Encima: <b>${U.fmt(dob)}</b></div><div>🏦 Guardado: <b>${U.fmt(saved)}</b></div></div>
      <div class="brow"><span>Depositar</span>${btn('dep', 100, '100', dob >= 100)}${btn('dep', 1000, '1.000', dob >= 1000)}${btn('dep', 'all', 'Todo', dob > 0)}</div>
      <div class="brow"><span>Retirar</span>${btn('wd', 100, '100', saved >= 100)}${btn('wd', 1000, '1.000', saved >= 1000)}${btn('wd', 'all', 'Todo', saved > 0)}</div>
      <h4>Inversiones</h4>${inv}${running}`;
  };

  // ---------- Panel de investigación ----------

  UI.researchOpen = () => !$('research').classList.contains('hidden');
  UI.openResearch = function () { UI.closeChooser(); $('research').classList.remove('hidden'); UI.renderResearch(); };
  UI.closeResearch = function () { $('research').classList.add('hidden'); };
  UI.toggleResearch = () => UI.researchOpen() ? UI.closeResearch() : UI.openResearch();

  UI.renderResearch = function () {
    const r = PV.Tech.st();
    if (!r) return;
    const hasCarto = PV.state.islands.some(i => i.owned && (i.buildings || []).some(b => D.base(b.type) === 'cartografo'));
    const cols = D.TECH_LINES.map(L => {
      const cards = Object.keys(D.TECH).filter(id => D.TECH[id].line === L.k).map(id => {
        const t = D.TECH[id], done = PV.Tech.done(id), cur = r.cur === id, ok = PV.Tech.reqOk(id);
        const got = r.prog[id] || {};
        const cost = Object.keys(t.cost).map(k => {
          const g = Math.min(t.cost[k], got[k] || 0);
          return `<span class="cost ${g >= t.cost[k] || done ? '' : 'miss'}">${done ? t.cost[k] : g + '/' + t.cost[k]} ${resName(k)}</span>`;
        }).join(' ');
        const pct = Math.round(PV.Tech.progress(id) * 100);
        let foot;
        if (done) foot = '<span class="tdone">✓ Investigado</span>';
        else if (!ok) foot = `<span class="muted">🔒 Requiere: ${t.req.filter(q => !PV.Tech.done(q)).map(q => D.TECH[q].n).join(', ')}</span>`;
        else foot = `<button data-t="${id}" class="${cur ? '' : 'primary'}">${cur ? 'Pausar' : pct ? 'Seguir (' + pct + '%)' : 'Investigar'}</button>`;
        return `<div class="tech ${done ? 'done' : cur ? 'cur' : ok ? '' : 'lock'}">
          <b>${t.n}</b><div class="sub">${t.desc}</div><div class="tcost">${cost}</div>
          ${cur ? `<div class="tbar"><i style="width:${pct}%"></i></div>` : ''}${foot}</div>`;
      }).join('');
      return `<div class="tcol"><h4>${L.icon} ${L.n}</h4>${cards}</div>`;
    }).join('');
    $('research').innerHTML = `<div class="rhead"><h2>🗺️ Investigación</h2><button data-act="close">Cerrar (I / Esc)</button></div>
      <p class="muted">${hasCarto ? 'Elegí una investigación y mandale los materiales a un <b>Cartógrafo</b> por senderos o estibadores. Con varios cartógrafos se investiga más rápido.' : 'Construí un <b>Cartógrafo</b> (tecla <kbd>C</kbd>) en tu isla y mandale los materiales que pide la investigación.'}</p>
      <div class="tcols">${cols}</div>`;
  };

  // Una fila por recurso con botones para mover 10 o todo.
  function invRows(bag, act, arrow) {
    const keys = Object.keys(bag).sort((a, b) => bag[b] - bag[a]);
    if (!keys.length) return '<div class="muted">vacío</div>';
    return '<div class="invrows">' + keys.map(k => `<div class="invrow"><i style="background:${D.RES[k].c}"></i><span>${resName(k)}</span><b>${bag[k]}</b>
      <button data-act="${act}" data-k="${k}" data-n="10">${arrow} 10</button><button data-act="${act}" data-k="${k}" data-n="all">${arrow} todo</button></div>`).join('') + '</div>';
  }
  let lastInfo = '', researchT = 0, bankT = 0;

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
      const sc = PV.Island.sel && D.BUILD[PV.Island.sel].cat;
      if (sc && sc !== UI.cat) UI.setCat(sc);
      $('buildcats').style.bottom = (48 + $('buildbar').offsetHeight + 6) + 'px';
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
    $('clock').classList.toggle('hidden', s === 'menu');
    if (s !== 'menu') { $('clock').innerHTML = PV.Colony.clock(); $('clock').classList.toggle('night', PV.Colony.isNight()); }
    const rb = s === 'menu' ? '' : PV.Raid.banner();
    $('raidBanner').classList.toggle('hidden', !rb);
    if (rb) $('raidBanner').innerHTML = rb;
    if (UI.bankOpen()) { bankT -= 0.15; if (bankT <= 0) { bankT = 1; UI.renderBank(); } }
    if (UI.researchOpen()) { researchT -= 0.15; if (researchT <= 0) { researchT = 1; UI.renderResearch(); } }
    if (s === 'island') {
      // Solo se redibuja si cambió, para no perder clics en los botones.
      const info = islandInfo();
      if (info !== lastInfo) { $('islandInfo').innerHTML = info; lastInfo = info; }
      document.querySelectorAll('#buildbar small[data-cost]').forEach(el => {
        const k = el.dataset.cost, lock = PV.Tech.buildLocked(k);
        el.innerHTML = lock ? '<span class="cost miss">🔒 investigar</span>' : PV.Inv.costHtml(D.BUILD[k].cost, PV.Island.cur);
        el.parentElement.classList.toggle('locked', !!lock);
        el.parentElement.classList.toggle('hidden', !!lock && !!D.BUILD[k].of); // las evoluciones aparecen al investigarlas
      });
    }
  };

  PV.UI = UI;
})(window.PV);
