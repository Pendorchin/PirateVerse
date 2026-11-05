# PirateVerse

Juego de piratas estilo Factorio: navegá un archipiélago, conquistá islas, automatizá la extracción de recursos y comerciá en los puertos.

## Cómo jugar
Abrí `index.html` en el navegador (doble clic). No hace falta instalar nada.

**En el mar:** W/S velas · A/D timón · Q babor · E estribor (cañones) · F interactuar · rueda zoom
**En la isla:** 1-5 elegir edificio · R rotar · clic construir (arrastrá para cintas) · clic derecho quitar · WASD cámara · Esc zarpar

La partida se guarda sola en el navegador.

## Estructura
- `js/data.js` — recursos, niveles de isla, edificios, recetas y mejoras (para balancear)
- `js/world.js` — generación procedural del mapa y de las islas
- `js/sea.js` — navegación, combate y conquista
- `js/island.js` — construcción y simulación de fábricas
- `js/port.js` — mercado, astillero y reparación
- `DISENO.md` — documento de diseño completo
