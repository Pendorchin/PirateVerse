// Partida en la nube: iniciás sesión con Google y la partida se guarda en Firebase,
// así la tenés en cualquier compu. Sin sesión (o sin internet) el juego sigue guardando solo en el navegador.
// La configuración de Firebase es pública a propósito: lo que protege las partidas son las reglas
// de Firestore (cada jugador solo puede leer y escribir la suya, en partidas/{uid}).
(function (PV) {
  'use strict';
  const CONFIG = {
    apiKey: 'AIzaSyB-8cTnqv2yYdpn_tsjlSigvofsElM-1sI',
    authDomain: 'pirateverse.firebaseapp.com',
    projectId: 'pirateverse',
    storageBucket: 'pirateverse.firebasestorage.app',
    messagingSenderId: '121310883733',
    appId: '1:121310883733:web:6d9ad182af4f478469909c',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const UPLOAD_EVERY = 60; // segundos como mínimo entre subidas

  const Cloud = { user: null, ready: false, status: '' };
  let fb = null, auth = null, db = null, lastUp = 0, pending = false, timer = null, busy = false;

  const pack = s => PV.Transfer.pack(s), unpack = s => PV.Transfer.unpack(s);

  function setStatus(s) { Cloud.status = s; PV.UI.cloudChanged && PV.UI.cloudChanged(); }

  // ---------- Inicio ----------
  Cloud.init = async function () {
    if (!PV.Transfer.isWeb()) return; // en el artifact de Claude no hay nube: se usa exportar/importar
    try {
      const [app, a, f] = await Promise.all([
        import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
      ]);
      fb = { ...a, ...f };
      const inst = app.initializeApp(CONFIG);
      auth = a.getAuth(inst);
      db = f.getFirestore(inst);
      Cloud.ready = true;
      a.onAuthStateChanged(auth, u => {
        Cloud.user = u ? { uid: u.uid, name: u.displayName || u.email, email: u.email } : null;
        setStatus('');
        if (u) sync();
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden) Cloud.flush(); });
    } catch (e) {
      console.warn('Nube no disponible:', e);
      setStatus('Sin conexión con la nube: la partida se guarda solo en este navegador.');
    }
  };

  Cloud.signIn = async function () {
    if (!Cloud.ready) return;
    try {
      await fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') setStatus('No se pudo iniciar sesión: ' + (e.code || e.message));
    }
  };

  Cloud.signOut = async function () {
    if (!Cloud.ready) return;
    await Cloud.flush();
    await fb.signOut(auth);
  };

  const ref = () => fb.doc(db, 'partidas', Cloud.user.uid);

  // Al entrar: si la nube tiene una partida más nueva, la baja; si la de esta compu es más nueva, la sube.
  async function sync() {
    if (busy) return;
    busy = true;
    setStatus('Sincronizando…');
    try {
      const snap = await fb.getDoc(ref());
      const cloud = snap.exists() ? snap.data() : null, localT = PV.Save.time();
      if (cloud && cloud.t > localT) {
        if (PV.scene === 'menu') {
          PV.Save.importRaw(await unpack(cloud.z), cloud.t);
          setStatus('Partida de la nube cargada (' + new Date(cloud.t).toLocaleString() + ').');
          PV.UI.toast('☁️ Bajé tu partida de la nube. Apretá "Continuar partida".', 'good');
        } else {
          setStatus('Hay una partida más nueva en la nube: recargá la página para usarla.');
        }
      } else if (PV.Save.has() && (!cloud || localT > cloud.t)) {
        await upload();
      } else setStatus('Partida sincronizada.');
    } catch (e) {
      console.warn(e);
      setStatus('No se pudo sincronizar: ' + (e.code || e.message));
    }
    busy = false;
  }

  async function upload() {
    const raw = PV.Save.raw();
    if (!raw || !Cloud.user) return;
    pending = false;
    lastUp = Date.now();
    try {
      await fb.setDoc(ref(), { z: await pack(raw), t: PV.Save.time(), v: 1 });
      setStatus('☁️ Guardado en la nube ' + new Date().toLocaleTimeString().slice(0, 5));
    } catch (e) {
      console.warn(e);
      pending = true;
      setStatus('No se pudo guardar en la nube: ' + (e.code || e.message));
    }
  }

  // Lo llama Save.save(): sube como mucho una vez por minuto.
  Cloud.queue = function () {
    if (!Cloud.user || busy) return;
    pending = true;
    if (timer) return;
    const wait = Math.max(0, UPLOAD_EVERY * 1000 - (Date.now() - lastUp));
    timer = setTimeout(() => { timer = null; if (pending) upload(); }, wait);
  };

  // Sube ya lo pendiente (al cerrar la pestaña o salir).
  Cloud.flush = function () {
    if (!Cloud.user || !pending) return Promise.resolve();
    clearTimeout(timer); timer = null;
    return upload();
  };

  PV.Cloud = Cloud;
})(window.PV);
