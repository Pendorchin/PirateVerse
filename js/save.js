// Guardado en el navegador. Las claves que empiezan con "_" son datos temporales y no se guardan.
// Si iniciaste sesión, además se sube a la nube (ver cloud.js).
(function (PV) {
  'use strict';
  const KEY = 'pirateverse_save_v1', TKEY = 'pirateverse_save_t';

  PV.Save = {
    save() {
      if (!PV.state) return false;
      try {
        localStorage.setItem(KEY, JSON.stringify(PV.state, (k, v) => (k[0] === '_' ? undefined : v)));
        localStorage.setItem(TKEY, String(Date.now()));
      } catch (e) {
        return false;
      }
      if (PV.Cloud) PV.Cloud.queue();
      return true;
    },
    load() {
      try {
        const s = localStorage.getItem(KEY);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    },
    has() {
      try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
    },
    // Para la nube: el texto guardado tal cual, y cuándo se guardó.
    raw() {
      try { return localStorage.getItem(KEY); } catch (e) { return null; }
    },
    time() {
      try { return +localStorage.getItem(TKEY) || 0; } catch (e) { return 0; }
    },
    importRaw(str, t) {
      localStorage.setItem(KEY, str);
      localStorage.setItem(TKEY, String(t));
    },
  };
})(window.PV);
