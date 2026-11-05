// Teclado y mouse. Los eventos se reenvían a PV.onKey / PV.onMouse (definidos en main.js).
(function (PV) {
  'use strict';
  const I = { keys: {}, mx: 0, my: 0 };
  const BLOCK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];

  window.addEventListener('keydown', e => {
    const first = !I.keys[e.code];
    I.keys[e.code] = true;
    if (BLOCK.includes(e.code)) e.preventDefault();
    if (first && PV.onKey) PV.onKey(e.code, e);
  });
  window.addEventListener('keyup', e => { I.keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in I.keys) I.keys[k] = false; });

  const cv = document.getElementById('game');
  cv.addEventListener('mousemove', e => { I.mx = e.clientX; I.my = e.clientY; if (PV.onMouse) PV.onMouse('move', e); });
  cv.addEventListener('mousedown', e => { if (PV.onMouse) PV.onMouse('down', e); });
  window.addEventListener('mouseup', e => { if (PV.onMouse) PV.onMouse('up', e); });
  cv.addEventListener('wheel', e => { e.preventDefault(); if (PV.onMouse) PV.onMouse('wheel', e); }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  PV.Input = I;
})(window.PV);
