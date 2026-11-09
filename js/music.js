// Música de fondo tranquila, hecha en el momento con el navegador (sin archivos):
// olas de mar suaves y unos acordes lentos con alguna nota suelta encima.
// Arranca con el primer clic o tecla (los navegadores no dejan sonar antes) y se apaga con el botón 🔊.
(function (PV) {
  'use strict';
  const KEY = 'pirateverse_music', VOL = 0.45, BAR = 9; // segundos por acorde
  const Music = { on: true };
  try { Music.on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* sin almacenamiento: queda prendida */ }

  // La menor, Fa, Do, Sol: suena a mar abierto, un poco melancólico.
  const CHORDS = [[45, 57, 60, 64], [41, 57, 60, 65], [36, 55, 60, 64], [43, 55, 59, 62]];
  const MELODY = [69, 72, 74, 76, 79, 81];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  let ac = null, master = null, bus = null, step = 0, timer = null;

  function setup() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    // Eco suave para que suene amplio.
    const delay = ac.createDelay(2), fb = ac.createGain(), wet = ac.createGain();
    delay.delayTime.value = 0.48; fb.gain.value = 0.38; wet.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    bus = ac.createGain();
    bus.connect(master); bus.connect(delay);
    waves();
    return true;
  }

  // Olas: ruido grave filtrado que sube y baja despacio.
  function waves() {
    const len = ac.sampleRate * 6, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    // Fundido en los bordes para que el loop no haga clic.
    const fade = ac.sampleRate * 0.5;
    for (let i = 0; i < fade; i++) { const f = i / fade; d[i] *= f; d[len - 1 - i] *= f; }
    const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; src.loop = true;
    lp.type = 'lowpass'; lp.frequency.value = 520;
    g.gain.value = 0.16;
    const lfo = ac.createOscillator(), depth = ac.createGain();
    lfo.frequency.value = 0.11; depth.gain.value = 0.1;
    lfo.connect(depth); depth.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
  }

  function pad(n, t, dur, vol) {
    const g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 3);
    g.gain.setValueAtTime(vol, t + dur - 3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(bus);
    for (const det of [-4, 4]) {
      const o = ac.createOscillator();
      o.type = 'triangle'; o.frequency.value = hz(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  function pluck(n, t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = hz(n);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + 3);
  }

  // Programa un acorde (y alguna nota suelta) por compás.
  function tick() {
    const t = ac.currentTime + 0.1, ch = CHORDS[step++ % CHORDS.length];
    ch.forEach((n, i) => pad(n, t, BAR + 2, i === 0 ? 0.05 : 0.028));
    const notes = Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) pluck(MELODY[Math.floor(Math.random() * MELODY.length)], t + 1 + Math.random() * (BAR - 3));
    timer = setTimeout(tick, BAR * 1000);
  }

  function apply() {
    const b = document.getElementById('musicBtn');
    if (b) { b.textContent = Music.on ? '🔊' : '🔇'; b.title = Music.on ? 'Apagar la música' : 'Prender la música'; }
    if (!ac) return;
    if (Music.on) {
      ac.resume();
      if (!timer) tick();
      master.gain.setTargetAtTime(VOL, ac.currentTime, 1.2);
    } else {
      master.gain.setTargetAtTime(0, ac.currentTime, 0.3);
      clearTimeout(timer); timer = null;
      setTimeout(() => { if (!Music.on) ac.suspend(); }, 1500);
    }
  }

  Music.state = () => (ac ? ac.state : 'sin iniciar');

  Music.toggle = function () {
    // Si todavía no sonaba (nadie había tocado nada), el primer toque la prende.
    if (!ac && Music.on) { if (setup()) apply(); return; }
    Music.on = !Music.on;
    try { localStorage.setItem(KEY, Music.on ? '1' : '0'); } catch (e) { /* no se guarda la preferencia */ }
    if (!ac && Music.on && !setup()) return;
    apply();
  };

  function firstGesture(e) {
    window.removeEventListener('pointerdown', firstGesture, true);
    window.removeEventListener('keydown', firstGesture, true);
    if (e.target && e.target.closest && e.target.closest('#musicBtn')) return; // de eso se encarga el botón
    if (Music.on && !ac && setup()) apply();
  }
  window.addEventListener('pointerdown', firstGesture, true);
  window.addEventListener('keydown', firstGesture, true);

  const btn = document.getElementById('musicBtn');
  if (btn) btn.addEventListener('click', e => { e.stopPropagation(); Music.toggle(); btn.blur(); });
  apply();

  PV.Music = Music;
})(window.PV);
