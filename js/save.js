// Guardado en el navegador. Las claves que empiezan con "_" son datos temporales y no se guardan.
(function (PV) {
  'use strict';
  const KEY = 'pirateverse_save_v1';

  PV.Save = {
    save() {
      if (!PV.state) return false;
      try {
        localStorage.setItem(KEY, JSON.stringify(PV.state, (k, v) => (k[0] === '_' ? undefined : v)));
        return true;
      } catch (e) {
        return false;
      }
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
  };
})(window.PV);
