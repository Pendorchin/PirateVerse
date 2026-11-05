// Mini tutorial: una cadena de objetivos que se van cumpliendo solos mientras jugás.
(function (PV) {
  'use strict';
  const Inv = () => PV.Inv;
  const owned = S => S.islands.filter(i => i.owned);
  const anyB = (S, type) => owned(S).some(i => i.buildings.some(b => b.type === type));
  const stored = S => owned(S).reduce((t, i) => t + Inv().storageTotal(i), 0);

  const STEPS = [
    { t: 'Desembarcá en <b>Isla Refugio</b>', h: 'Navegá hasta tu isla y apretá <kbd>F</kbd> cerca de la costa.',
      done: S => PV.scene === 'island' || owned(S).some(i => i.buildings.length) },
    { t: 'Poné un <b>extractor</b> sobre un yacimiento', h: 'Tecla <kbd>1</kbd>. Las piedritas de colores y los árboles son yacimientos.',
      done: S => anyB(S, 'extractor') },
    { t: 'Construí un <b>almacén</b>', h: 'Tecla <kbd>3</kbd>. Guarda lo que le llega por cinta.',
      done: S => anyB(S, 'almacen') },
    { t: 'Conectá el extractor al almacén con <b>cintas</b>', h: 'Tecla <kbd>2</kbd> y arrastrá desde la flecha amarilla del extractor hasta el almacén.',
      done: S => stored(S) > 0 },
    { t: 'Juntá <b>30 recursos</b> en tus almacenes', h: 'Más extractores = más rápido. Las fábricas siguen andando aunque zarpes.',
      done: S => stored(S) >= 30 || (S.sold || 0) > 0 },
    { t: 'Cargá el barco', h: 'Botón <b>⬆ Cargar al barco</b> en el panel de la isla.',
      done: S => Inv().cargoTotal() > 0 || (S.sold || 0) > 0 },
    { t: 'Vendé en un <b>puerto</b> ⚓', h: 'Buscá un puerto en el mapa (punto amarillo en el minimapa) y apretá <kbd>F</kbd>.',
      done: S => (S.sold || 0) > 0 },
    { t: 'Mejorá tu barco en el <b>astillero</b>', h: 'Las mejoras piden doblones y materiales en la bodega (por ej. tablones del aserradero).',
      done: S => Object.values(S.ship.up).some(v => v > 0) },
    { t: 'Destruí una <b>torre enemiga</b>', h: 'Las islas ★★ tienen torres. Ponete de costado y dispará con <kbd>Q</kbd> / <kbd>E</kbd>.',
      done: S => (S.towersKilled || 0) > 0 },
    { t: 'Conquistá una <b>isla nueva</b>', h: 'Sin torres ni barcos guardianes, acercate y fundá tu fuerte con <kbd>F</kbd>.',
      done: S => owned(S).length > 1 },
  ];

  const Tut = {};
  let shownStep = -1;

  Tut.update = function () {
    const S = PV.state, el = document.getElementById('quest');
    if (S.tut === undefined) S.tut = 0;
    while (S.tut < STEPS.length && STEPS[S.tut].done(S)) {
      S.tut++;
      PV.UI.toast(S.tut < STEPS.length ? '✔ Objetivo cumplido' : '🏴‍☠️ ¡Tutorial completo! El archipiélago es tuyo.', 'good');
    }
    const hide = S.tut >= STEPS.length || S.tutOff;
    el.classList.toggle('hidden', !!hide || PV.scene === 'port');
    if (hide || shownStep === S.tut) return;
    shownStep = S.tut;
    const st = STEPS[S.tut];
    el.innerHTML = `<h4>Objetivo <small>${S.tut + 1} / ${STEPS.length}</small></h4>
      <div class="qtext">${st.t}</div><div class="qhint">${st.h}</div>
      <div class="qbar"><div style="width:${(S.tut / STEPS.length) * 100}%"></div></div>
      <button data-act="hide" title="Ocultar tutorial">ocultar</button>`;
  };

  // Al cargar otra partida hay que volver a dibujar el objetivo.
  Tut.reset = function () { shownStep = -1; };

  document.addEventListener('click', e => {
    const b = e.target.closest('#quest button');
    if (b && PV.state) { PV.state.tutOff = true; Tut.update(); }
  });

  PV.Tutorial = Tut;
})(window.PV);
