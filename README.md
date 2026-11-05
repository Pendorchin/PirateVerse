# PirateVerse

Juego de piratas estilo Factorio: navegá un archipiélago, conquistá islas, automatizá la extracción de recursos y comerciá en los puertos.

## Cómo jugar
Abrí `index.html` en el navegador (doble clic). No hace falta instalar nada.

**En el mar:** W/S velas · A/D timón · Q babor · E estribor (cañones) · F interactuar · rueda zoom
**En la isla:** 1 leñadores · 2 mina · 3 sendero · 4 almacén · 5-0 fábricas · M muelle · R rotar · clic construir (arrastrá para senderos) · clic en capataz, estibador, taller, herrería o muelle para elegir receta/filtro · clic derecho quitar · WASD cámara · Esc zarpar · en el panel de la isla elegís qué recurso subir o bajar del barco

La partida se guarda sola en el navegador.

## Estructura
- `js/data.js` — recursos, niveles de isla, edificios, recetas y mejoras (para balancear)
- `js/world.js` — generación procedural del mapa y de las islas
- `js/sea.js` — navegación, combate y conquista
- `js/island.js` — construcción y simulación de fábricas
- `js/port.js` — mercado, astillero, flota y reparación
- `js/fleet.js` — barcos mercantes que venden solos
- `js/sprites.js` — sprites pixel art (SpriteCook)
- `DISENO.md` — documento de diseño completo
