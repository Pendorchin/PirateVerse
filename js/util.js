// Utilidades generales. Todo el juego vive en el objeto global PV.
window.PV = { time: 0 };

(function (PV) {
  'use strict';
  const U = {};

  // Generador pseudoaleatorio con semilla (mulberry32): el mismo número da el mismo mundo.
  U.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Ruido determinista por coordenada (para decoración que no cambia entre cuadros).
  U.hash = function (x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.range = (r, a, b) => a + r() * (b - a);
  U.fmt = n => Math.floor(n).toLocaleString('es');

  // Diferencia de ángulos a - b normalizada a [-PI, PI].
  U.angDiff = function (a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  U.shuffle = function (r, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  PV.U = U;
})(window.PV);
