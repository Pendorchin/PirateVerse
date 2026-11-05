// Sprites pixel art (SpriteCook). Se cargan al inicio; si una imagen no cargó, se usa el dibujo por código.
(function (PV) {
  'use strict';
  const NAMES = ['torre', 'torre_rota', 'muelle', 'fuerte', 'bandera', 'naufragio',
    'barco_balandra', 'barco_bergantin', 'barco_galeon'];
  const imgs = {};
  for (const n of NAMES) {
    const im = new Image();
    im.src = 'assets/sprites/' + n + '.png';
    imgs[n] = im;
  }

  const Spr = {};
  Spr.ok = n => imgs[n] && imgs[n].complete && imgs[n].naturalWidth > 0;
  Spr.src = n => 'assets/sprites/' + n + '.png';

  // Dibuja el sprite apoyado en (x, y) por el centro de su base. Devuelve false si no está listo.
  Spr.draw = function (ctx, n, x, y, scale, alpha) {
    if (!Spr.ok(n)) return false;
    const im = imgs[n], w = im.naturalWidth * scale, h = im.naturalHeight * scale;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - h), w, h);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = sm;
    return true;
  };

  // Clase del barco según la suma de niveles de mejora (0–20).
  Spr.CLASSES = [
    { min: 0, n: 'Balandra', img: 'barco_balandra' },
    { min: 5, n: 'Bergantín', img: 'barco_bergantin' },
    { min: 12, n: 'Galeón', img: 'barco_galeon' },
  ];
  Spr.shipClass = function (up) {
    const lv = Object.values(up).reduce((a, b) => a + b, 0);
    let i = 0;
    while (i + 1 < Spr.CLASSES.length && lv >= Spr.CLASSES[i + 1].min) i++;
    return { lv, cur: Spr.CLASSES[i], next: Spr.CLASSES[i + 1] || null };
  };

  PV.Spr = Spr;
})(window.PV);
