# HUD de protocolo de diagnosis + efectos futuristas

Fecha: 2026-11-19 · Alcance: solo capa de presentación (sin backend, datos, SEO ni textos legales).

## Archivos

- `public/index.html`
  - Nuevo `<link rel="stylesheet" href="/css/protocolo.css?v=20261118pdx">` al final del bloque de CSS (después de apex).
  - Nueva sección `#pdxHud` dentro de `#view-obd`, justo antes de `.obd-cockpit`.
  - Nuevo `<script src="/js/protocolo.js?v=20261118pdx">` al final del body.
- `public/css/protocolo.css` (nuevo, namespace `pdx-`).
- `public/js/protocolo.js` (nuevo).

No se ha tocado `obd.js`, `app.js`, backend, datos, SEO ni textos legales.

## Qué se ve

### HUD · Protocolo de diagnóstico

- Cabecera `PROTOCOLO DE DIAGNÓSTICO` con estado en vivo y fuente.
- Radar SVG/CSS con anillo de barrido, núcleo OBD y nodos ilustrativos ECU · ABS · SRS · TCU.
- Chips de protocolo (CAN 11/500, CAN 29/500, KWP2000, ISO 9141, J1850 PWM, J1850 VPW, J1939).
  El chip correspondiente se resalta con el valor real de `#obdProtocol`; no afirma qué protocolo usa el coche.
- Secuencia de 5 pasos: Enlace, Handshake, Negociación, ECU, DTC.
- Traza tipo terminal con marca de tiempo, etiqueta `DEMO`/`OBD`/`FUENTE`/`ERROR` y límite de 40 líneas.
- Botón `Simular secuencia`: anima el HUD y muestra la insignia DEMO. No abre puertos, no contacta con la ECU ni muestra lecturas inventadas.
- Con una conexión real activa el botón demo se desactiva para no tapar el estado real.

### Sincronización real

- `MutationObserver` sobre `#obdStatus` y `#obdSourceLabel` (atributos `data-state`, texto e hijos).
- El HUD copia el estado y la fuente reales; las líneas de traza solo se añaden cuando cambia un valor observado.
- Los pasos se marcan según los estados reales del panel (`connecting`, `connected`, `reading`, `disconnected`, `error`).
- Los nodos ECU/ABS/SRS/TCU permanecen apagados en modo real: son ilustrativos y no se consultan módulos.

### Efectos globales

- Transición de vistas tipo warp (fade + escala + desenfoque) al cambiar de sección.
- Barra de progreso de scroll neón: se reutiliza la barra existente (sin un listener duplicado), con estela luminosa.
- Luz ambiental que sigue al puntero y tilt 3D muy suave en paneles, tarjetas y botones con **un solo** listener global (`pointermove`, con `requestAnimationFrame`).
- Hero con anillos holográficos en CSS puro, barrido cónico, scanlines y rejilla en perspectiva.

### Accesibilidad y rendimiento

- `aria-live` en estado y traza (`role="log"`), etiquetas del radar y textos alternativos.
- Foco visible en botón y traza (foco nativo + `:focus-visible`).
- `prefers-reduced-motion`: desactiva barridos, pulsos, warp, tilt y luz ambiental; la demo mantiene los cambios de estado sin animación.
- Sin canvas, sin imágenes externas y sin sonido.

## Verificación

- `node --check public/js/protocolo.js` → OK.
- Comprobación de estructura HTML con `html.parser` → OK (sin etiquetas sin cerrar).
- Recuento de llaves CSS → 146/146.
- `node --test tests/*.test.mjs` → **194 tests, 194 pass, 0 fail**.
- No se ha hecho captura ni navegación visual: en esta máquina no hay Chrome disponible.

## Decisiones seguras

- La demo está etiquetada como DEMO en insignia, estado y cada línea de traza.
- No se simulan lecturas de PID, DTC ni módulos reales.
- La barra de scroll y el brillo existente se amplían por CSS para no duplicar listeners ni capas.
- Los nodos del radar son decorativos y así se declara en el `aria-label` y en la nota del HUD.
