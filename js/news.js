// Novedades: lo que trae cada actualización grande. Se muestran en el menú de inicio,
// la más nueva arriba y abierta; las anteriores, plegadas.
(function (PV) {
  'use strict';
  const NEWS = [
    { t: 'Mares y puertos nuevos', d: '8 nov 2026', items: [
      '🧭 El mar ahora tiene <b>5 zonas</b>, cada una con su color: Aguas Mansas, Mar de las Brumas, Costa de las Especias, Arrecifes de Coral y Mar de Ceniza.',
      '⚓ Hay <b>8 puertos</b> (antes 3). Cada zona vende lo suyo barato, paga bien lo que le falta y no compra algunas cosas: llevá mercancía de un mar a otro para ganar más.',
      '📦 Lo que vende un puerto se acaba y se repone de a poco. Raciones, ron y balas se consiguen en todos.',
      '🔀 Nuevo <b>Repartidor</b> (tecla <kbd>N</kbd>, pestaña Logística): divide la carga de un sendero en 2 caminos, una a la izquierda y otra a la derecha. Si un lado se llena, manda todo al otro.',
      '💪 Estibador: nueva opción <b>⛔ Nada</b> para dejarlo parado. Y con la investigación <b>Estibadores con lista</b>, la opción <b>🔬 Lo que pide la investigación</b>: saca del almacén solo lo que le falta a la investigación de ahora.',
      '🎵 Música de fondo tranquila, con olas. Se apaga con el botón 🔊 de abajo a la derecha.',
      '🐛 Arreglado: las minas profundas, el campamento maderero, el alto horno y los demás edificios grandes (y también la pesquería y la cocina) no sacaban nada por la flecha. Ahora entregan a cualquiera de las dos casillas de adelante.',
      '🐛 Arreglado: después de la primera noche los pescadores, los que cosechan caña, los mineros y demás trabajadores se quedaban quietos.',
    ] },
    { t: 'Partida en la nube', d: '8 nov 2026', items: [
      '☁️ El juego está en la web. Iniciá sesión con Google y tu partida se guarda en la nube: la tenés en cualquier compu.',
      '📤 Exportar e importar la partida con un código o un archivo.',
    ] },
    { t: 'Vida en la colonia', d: '8 nov 2026', items: [
      '🌙 Día y noche: de noche tu gente deja de trabajar y va a la taberna a comer y tomar ron.',
      '🍺 Pesquerías, cocinas, cañaverales y destilerías. Sin comida se trabaja más lento; sin ron baja la moral y hay huelga.',
    ] },
    { t: 'Asaltos piratas', d: '6 nov 2026', items: [
      '🏴‍☠️ Los piratas atacan tus islas: baterías, empalizadas, cuarteles y torres vigía para defenderte.',
      '🧔 El contramaestre te enseña a jugar paso a paso.',
    ] },
  ];

  function render() {
    const box = document.getElementById('newsBox');
    if (!box) return;
    const entry = (n, open) => `<details class="news" ${open ? 'open' : ''}><summary><b>${n.t}</b> <span class="muted">· ${n.d}</span></summary>
      <ul>${n.items.map(i => `<li>${i}</li>`).join('')}</ul></details>`;
    box.innerHTML = `<h3>📜 Novedades</h3>${entry(NEWS[0], true)}${NEWS.length > 1 ? `<details class="news old"><summary>Actualizaciones anteriores</summary>${NEWS.slice(1).map(n => entry(n, false)).join('')}</details>` : ''}`;
  }
  render();

  PV.News = NEWS;
})(window.PV);
