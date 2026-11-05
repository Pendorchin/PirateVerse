# 🏴‍☠️ PirateVerse — Documento de Diseño (v0.1, borrador para aprobar)

> Estado: **pendiente de aprobación**. No se escribe código hasta que lo apruebes.

---

## 1. Resumen
Juego **sandbox para un jugador**, 2D vista desde arriba, estilo **Factorio** con temática pirata.
Navegás un archipiélago generado al azar, conquistás islas, construís cadenas de producción
automatizadas, comerciás en puertos y usás los materiales para mejorar tu flota.

**Bucle principal:**
Navegar → explorar/conquistar isla → construir extractores y fábricas → transportar/vender →
mejorar barcos → islas más raras y peligrosas.

## 2. Decisiones técnicas
| Tema | Decisión |
|---|---|
| Plataforma | Web (navegador), publicable en itch.io |
| Gráficos | 2D vista desde arriba, dibujados por código al inicio (se pueden reemplazar por sprites) |
| Combate | Tiempo real |
| Profundidad Factorio | Completa: cintas, insertadores, cadenas de varios pasos |
| Jugadores | Un jugador. Lógica separada del dibujado para permitir multijugador a futuro |
| Datos | Recetas, islas, mejoras, enemigos y lore en archivos de datos separados (reutilizables para un futuro port a Roblox) |
| Guardado | Partida guardada en el navegador + exportar/importar archivo |

## 3. Vistas del juego
1. **Mapa del mar** — manejás el barco, niebla de guerra, clima, encuentros, rutas.
2. **Isla** — grilla de construcción (tiles), recursos, edificios, enemigos, ruinas.
3. **Puerto** — mercado, astillero (mejoras), taberna (tripulación), mapas del tesoro.

## 4. Mundo
- **Generación procedural:** cada partida crea un archipiélago distinto (con "semilla" para repetir mapas).
- Islas más cerca del inicio = comunes; más lejos = raras/peligrosas.
- **Clima:** tormentas que dañan barcos y bloquean rutas; algunas requieren mejoras para cruzarlas.
- **Eventos aleatorios:** barcos a la deriva (botín), mercaderes errantes, patrullas de la Marina, niebla.

## 5. Recursos por nivel
| Nivel | Recursos | Enemigos |
|---|---|---|
| 1 · Común | Madera, piedra, cobre, pescado | Ninguno / cangrejos |
| 2 · Poco común | Hierro, carbón, azúcar, algodón | Bandidos, piratas menores |
| 3 · Raro | Plata, especias, perlas, azufre | Fortalezas piratas, Marina |
| 4 · Épico | Oro, gemas, coral negro | Fuertes con cañones, flotas |
| 5 · Legendario | Cristal de kraken, oro maldito | Jefes: Kraken, Barco Fantasma |

**Yacimientos que se agotan:** cada veta tiene una cantidad finita → obliga a expandirse.

## 6. Producción (estilo Factorio)
**Edificios base:** extractor (mina/aserradero/pesquería), cinta transportadora, insertador,
almacén, fundición, taller, muelle (carga/descarga barcos).

**Cadenas de ejemplo:**
- Madera → Aserradero → Tablones
- Hierro + Carbón → Fundición → Lingote de hierro → Herrería → Balas de cañón / placas
- Cobre + Hierro → Fundición → Bronce → Cañón de bronce
- Azúcar → Destilería → Ron
- Azufre + Carbón → Polvorín → Pólvora
- Algodón → Telar → Velas
- Comida: Pescado / Especias → Cocina → Raciones

Las cadenas avanzadas requieren materiales de **varias islas** → logística marítima.

## 7. Barcos y mejoras
**Tipos de barco:** balandra (inicial), bergantín, galeón, mercante, buque de guerra.

| Categoría | Mejoras | Materiales |
|---|---|---|
| 📦 Carga | Bodega ampliada I-III, barriles, compartimentos | Tablones, hierro |
| 🛡️ Defensa | Casco reforzado, blindaje de hierro, blindaje de coral negro | Hierro, plata, coral negro |
| 💥 Ofensiva | +cañones, cañones de bronce, balas incendiarias, cadenas | Bronce, hierro, pólvora |
| 🌬️ Movilidad | Velas de algodón, timón mejorado, casco ligero | Velas, madera |
| 🔮 Mística | Ver a través de niebla, resistir tormentas, aura anti-kraken | Artefactos + gemas |

Cada barco tiene **espacios de mejora** limitados → hay que elegir.

## 8. Tripulación
- Se contrata en tabernas. Consume **raciones** y **ron**.
- **Moral:** baja con hambre, sin ron o tras derrotas. Moral muy baja → **motín**.
- La tripulación sirve para desembarcar y conquistar islas.

## 9. Combate (tiempo real)
- **En el mar:** controlás el barco, disparás andanadas por babor/estribor.
- **En la isla:** desembarcás tripulación; el barco puede bombardear desde la costa.
- **Conquista:** destruís las defensas → plantás tu **bandera/fuerte** → la isla es tuya.
- **Contraataques:** los enemigos atacan tus islas periódicamente → torres, cañones de costa, muros.

## 10. Comercio y economía
- Varios puertos con **precios dinámicos** (oferta/demanda).
- **Facciones:** Corona, Hermandad Pirata, Liga Mercante — reputación afecta precios y hostilidad.
- **Contrabando:** productos ilegales en ciertos puertos, más caros, pero atraen a la Marina.
- **Rutas automáticas:** barcos mercantes programables (ir a isla A, cargar X, vender en puerto B).

## 11. Lore y artefactos
- Cada isla tuvo antiguos habitantes: ruinas, tótems, templos, diarios.
- Al explorar se encuentran **fragmentos de historia** → se juntan en el **Códice**.
- **Artefactos místicos** con bonos únicos (extractores más rápidos, escudo de isla, mejoras místicas).
- **Mapas del tesoro:** encontrados o comprados, llevan a islas secretas con artefactos.

## 12. Progresión
- **Árbol de investigación** ("Cartografía", "Metalurgia", "Navegación", "Artes Arcanas"),
  pagado con recursos y "pergaminos de conocimiento".
- Desbloquea edificios, recetas, barcos y mejoras.

## 13. Fases de desarrollo
| Fase | Contenido |
|---|---|
| **1 · MVP** | Mapa procedural chico, navegación, 1 isla construible, extractor + almacén, 1 puerto para vender, guardado |
| **2 · Fábrica** | Cintas, insertadores, fundición, cadenas, mercado dinámico, mejoras de carga |
| **3 · Combate** | Enemigos, combate naval y terrestre, conquista, defensas, contraataques, mejoras ofensivas/defensivas |
| **4 · Mundo vivo** | Tripulación y moral, clima, eventos, facciones, contrabando, rutas automáticas, flota |
| **5 · Misterio** | Lore, Códice, artefactos, mapas del tesoro, islas nivel 4-5, jefes, árbol de investigación completo |
| **6 · Pulido** | Sonido, gráficos mejorados, balance, tutorial, publicación en itch.io |

## 14. Preguntas abiertas
1. **Herramientas:** tu PC no tiene Node.js instalado. Opciones:
   - **(a)** JavaScript puro + Canvas, sin instalar nada: abrís `index.html` y juega. *(recomendado para empezar)*
   - **(b)** Instalar Node.js para usar TypeScript + Vite (más ordenado para un proyecto grande).
2. **Git:** ¿inicializo un repositorio git para guardar el historial de cambios? *(recomendado)*
3. **Idioma del juego:** ¿solo español, o español + inglés?
