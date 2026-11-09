// Novedades: lo que trae cada actualización grande. Se muestran en el menú de inicio,
// la más nueva arriba y abierta; las anteriores, plegadas.
(function (PV) {
  'use strict';
  const NEWS = [
    { t: 'Mares y puertos nuevos', d: '8 nov 2026', items: [
      '🧭 El mar ahora tiene <b>5 zonas</b>, cada una con su color: Aguas Mansas, Mar de las Brumas, Costa de las Especias, Arrecifes de Coral y Mar de Ceniza.',
      '⚓ Hay <b>8 puertos</b> (antes 3). Cada zona vende lo suyo barato, paga bien lo que le falta y no compra algunas cosas: llevá mercancía de un mar a otro para ganar más.',
      '📦 Lo que vende un puerto se acaba y se repone de a poco. Raciones, ron y balas se consiguen en todos.',
      '🌞 Los <b>días</b> duran más: 10 minutos (7½ de día y 2½ de noche).',
      '🏴‍☠️ Los <b>asaltos</b> llegan una vez por semana, al amanecer de los días 8, 15, 22… (el reloj de arriba te dice cuándo). Ahora vienen con un barco más, más resistentes, saquean más rápido y se llevan un poco más.',
      '🧠 Los barcos piratas son más <b>inteligentes</b>: rodean las islas, te encierran entre varios por los dos costados, apuntan adonde vas a estar y los guardianes muy golpeados huyen a repararse.',
      '🍲 La <b>cocina</b> ahora necesita leña para el fuego: 2 pescados + 1 madera = 4 raciones. Llevale madera por un sendero.',
      '⚓ Los <b>muelles</b> ahora tienen modo: <b>📤 Carga</b> (los barcos se llevan lo que traen los senderos) o <b>📥 Descarga</b> (lo que bajan tu barco y las balandras queda en el muelle, y lo sacás con estibadores). Se cambia haciendo clic en el muelle. En los de carga también podés elegir <b>No vender nada</b>: los mercantes no lo tocan, pero tu barco y las balandras sí.',
      '💰 Cada <b>mercante</b> nuevo cuesta más, pero carga más (+10 por cada uno) y navega más rápido (+6%). Los que ya tenías quedan como el primero.',
      '⛵ <b>Balandras</b> entre tus islas: hacé clic en el muelle de una isla y comprá una (400 doblones y 30 tablones, 2 por muelle). Tiene hasta 2 paradas y en cada una elegís si <b>trae</b> a esta isla lo que hay en el muelle de la otra, o <b>lleva</b> lo de este muelle al almacén de la otra.',
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
