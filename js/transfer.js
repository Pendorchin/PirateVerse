// Exportar e importar la partida como código de texto o archivo, para pasarla a otra compu
// o mudarla del artifact de Claude a la página web. Incluye un mini tutorial de cómo hacerlo.
(function (PV) {
  'use strict';
  const WEB = 'https://pendorchin.github.io/PirateVerse/';
  const PREFIX = 'PV1:';
  const $ = id => document.getElementById(id);
  const T = {};

  // Dónde corre el juego: en la web (con nube) o en otro lado, como el artifact de Claude.
  T.isWeb = () => /github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
  T.WEB = WEB;

  // ---------- Comprimir: la partida pasa de ~60 KB a ~12 KB ----------
  T.pack = async function (str) {
    const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(s).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  T.unpack = async function (b64) {
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
  };

  // Lee un código y devuelve el texto de la partida, o tira un error con una explicación.
  async function decode(code) {
    code = (code || '').replace(/\s+/g, '');
    if (!code.startsWith(PREFIX)) throw new Error('Ese código no es de PirateVerse. Tiene que empezar con PV1:');
    let raw;
    try { raw = await T.unpack(code.slice(PREFIX.length)); } catch (e) { throw new Error('El código está cortado o incompleto. Copialo entero.'); }
    let s;
    try { s = JSON.parse(raw); } catch (e) { throw new Error('El código está dañado.'); }
    if (!s || !Array.isArray(s.islands) || !s.ship) throw new Error('El código no tiene una partida adentro.');
    return { raw, s };
  }

  // ---------- Panel ----------
  const HOWTO = `
    <ol class="howto">
      <li>En el juego viejo (por ejemplo, el artifact de Claude), en el menú, tocá <b>📤 Exportar</b> y después <b>Copiar código</b> (o <b>Descargar archivo</b>).</li>
      <li>Abrí la página nueva: <a href="${WEB}" target="_blank" rel="noopener">${WEB.replace('https://', '')}</a>.</li>
      <li>Ahí tocá <b>📥 Importar</b>, pegá el código (o elegí el archivo) y tocá <b>Importar partida</b>.</li>
      <li>Iniciá sesión con Google: tu partida queda en la nube y la tenés en cualquier compu.</li>
    </ol>`;

  function open(html) {
    const p = $('savePanel');
    p.innerHTML = `<button class="x" data-sv="close" title="Cerrar">✕</button>${html}`;
    p.classList.remove('hidden');
  }
  T.close = () => $('savePanel').classList.add('hidden');

  T.openHowto = function () {
    open(`<h2>🧭 Cómo pasar tu partida</h2>${HOWTO}
      <div class="row"><button data-sv="export" class="primary">📤 Exportar</button><button data-sv="import">📥 Importar</button></div>`);
  };

  T.openExport = async function () {
    const raw = PV.Save.raw();
    if (!raw) return open('<h2>📤 Exportar partida</h2><p>Todavía no tenés ninguna partida guardada.</p>');
    const code = PREFIX + await T.pack(raw);
    open(`<h2>📤 Exportar partida</h2>
      <p>Este código es tu partida entera. Copialo y pegalo en <b>📥 Importar</b> en la otra página o compu.</p>
      <textarea id="svCode" readonly>${code}</textarea>
      <div class="row"><button data-sv="copy" class="primary">📋 Copiar código</button><button data-sv="file">💾 Descargar archivo</button></div>
      <div id="svMsg" class="sv-msg"></div>
      <details><summary>¿Cómo sigo?</summary>${HOWTO}</details>`);
    $('svCode').addEventListener('focus', e => e.target.select());
  };

  T.openImport = function () {
    open(`<h2>📥 Importar partida</h2>
      <p>Pegá el código que exportaste (empieza con <b>PV1:</b>) o elegí el archivo <b>.pirateverse</b>.</p>
      <textarea id="svCode" placeholder="PV1:..."></textarea>
      <div class="row"><label class="filebtn">📂 Elegir archivo<input id="svFile" type="file" accept=".pirateverse,.txt"></label>
        <button data-sv="doImport" class="primary">Importar partida</button></div>
      <div id="svMsg" class="sv-msg"></div>
      <details><summary>¿De dónde saco el código?</summary>${HOWTO}</details>`);
    $('svFile').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (f) $('svCode').value = (await f.text()).trim();
    });
  };

  const msg = (t, bad) => { const m = $('svMsg'); if (m) { m.textContent = t; m.className = 'sv-msg ' + (bad ? 'bad' : 'good'); } };

  async function copy() {
    const ta = $('svCode');
    try { await navigator.clipboard.writeText(ta.value); msg('¡Copiado! Ahora pegalo en 📥 Importar en la página nueva.'); }
    catch (e) {
      ta.focus(); ta.select();
      try { document.execCommand('copy'); msg('¡Copiado! Ahora pegalo en 📥 Importar en la página nueva.'); }
      catch (e2) { msg('No pude copiar solo: el código ya está seleccionado, apretá Ctrl+C.', true); }
    }
  }

  function download() {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([$('svCode').value], { type: 'text/plain' }));
      a.download = 'partida.pirateverse';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      msg('Descargando partida.pirateverse…');
    } catch (e) { msg('Acá no se puede descargar: usá Copiar código.', true); }
  }

  async function doImport() {
    let r;
    try { r = await decode($('svCode').value); } catch (e) { return msg(e.message, true); }
    if (PV.Save.has() && !confirm('¿Reemplazar la partida guardada en esta compu por la que importás?')) return;
    PV.Save.importRaw(r.raw, Date.now());
    if (PV.Cloud && PV.Cloud.user) { PV.Cloud.queue(); PV.Cloud.flush(); }
    T.close();
    PV.UI.cloudChanged();
    const own = r.s.islands.filter(i => i.owned).length;
    PV.UI.toast(`📥 Partida importada: ${own} ${own === 1 ? 'isla' : 'islas'} y ${PV.U.fmt(r.s.doblones || 0)} doblones. Apretá "Continuar partida".`, 'good');
  }

  T.init = function () {
    $('savePanel').addEventListener('click', e => {
      const b = e.target.closest('[data-sv]');
      if (!b) return;
      const a = b.dataset.sv;
      if (a === 'close') T.close();
      else if (a === 'export') T.openExport();
      else if (a === 'import') T.openImport();
      else if (a === 'copy') copy();
      else if (a === 'file') download();
      else if (a === 'doImport') doImport();
    });
    $('saveRow').addEventListener('click', e => {
      const b = e.target.closest('[data-sv]');
      if (!b) return;
      if (b.dataset.sv === 'export') T.openExport();
      else if (b.dataset.sv === 'import') T.openImport();
      else if (b.dataset.sv === 'howto') T.openHowto();
    });
    // Fuera de la web (artifact de Claude): cartel de mudanza.
    if (!T.isWeb()) {
      const m = $('moveBanner');
      m.innerHTML = `⚓ <b>El juego se mudó</b> a <a href="${WEB}" target="_blank" rel="noopener">${WEB.replace('https://', '')}</a>: ahí tu partida se guarda en la nube. <button data-sv="howto">¿Cómo paso mi partida?</button>`;
      m.classList.remove('hidden');
      m.addEventListener('click', e => { if (e.target.closest('[data-sv="howto"]')) T.openHowto(); });
    }
  };

  PV.Transfer = T;
})(window.PV);
