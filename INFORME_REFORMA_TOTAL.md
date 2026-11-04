# Informe de cierre — Reforma total

> Nota de vigencia: este documento cubre la fase de reforma visual de octubre de 2026. El estado más reciente (3D, escáner de fichas, compra y pendientes) está en `INFORME_REMODELACION_2026-10-23.md`.
>
> **Aviso (29/10/2026):** la Biblioteca técnica mencionada en este informe se eliminó de la aplicación. Se conserva una copia en `backups/biblioteca-tecnica-20261029.tar.gz`; las referencias del documento son históricas.

Fecha: 2026-10-23  
Proyecto: `/home/selupiro/diagnostico-mecanica`  
Alcance: reconstrucción visual e integral, síntomas, soluciones por sistema, validación y documentación.

## Veredicto

La aplicación queda funcional, arrancada y probada. La reforma visual está aplicada a las diez vistas, el buscador universal y el panel de sistemas funcionan, los síntomas se consolidaron y enriquecieron sin inventar relaciones, y se añadió una vista de soluciones por sistema dentro de Diagnóstico.

No se entrega un vehículo WebGL ni un catálogo de miles de síntomas. El 3D es un render CSS/SVG interactivo, permitido como alternativa técnica, y el catálogo real contiene 204 síntomas únicos. Ambas decisiones están documentadas y no se presentan como si fueran datos o recursos que no existen.

## 1. Estado inicial

- Proyecto Node.js/Express con frontend SPA en JavaScript vanilla.
- Base de datos local SQLite mediante `node:sqlite`.
- 9.201 códigos DTC, 219 registros de síntomas y 235 productos.
- 193 tutoriales verificados en la fase anterior.
- El rediseño anterior estaba truncado y varias vistas conservaban estilos y comportamientos antiguos.
- No se revirtió ni se borró trabajo previo.

Backup realizado antes de la reforma:

- `backups/pre-reforma-total-20261023-013125.tar.gz`
- SHA256: `5fb5b1e359091b4a5038ba9368aa741e201ef7a3261d9f13ed2c672efd5acb62`

Backup realizado antes de reconstruir los síntomas:

- `backups/pre-sintomas-20261023-030423.tar.gz`
- SHA256: `2c993d75b47f6dd48040d17806508215d88769fa26eacfe226160294410ba105`

## 2. Trabajo realizado

### 2.1 Identidad visual y navegación

- Nueva capa `public/css/reforma.css`, cargada después de `tutorials.css`.
- Paleta violeta `#8b5cf6`, cyan `#22d3ee` y magenta `#f472b6` sobre cristal oscuro.
- Bordes achaflanados, rejilla técnica, HUD, telemetría y tipografía local.
- Recoloreados `public/css/vision.css` y `public/css/tutorials.css`, conservando ámbar y rojo para advertencias.
- Navegación y vistas revisadas una a una: Home, Diagnóstico, DTC, OBD-II, Tutoriales, Productos, Chat IA, Informe, Foro y Contacto.

### 2.2 Home y vehículo

- Nuevo `public/img/hero-car-nexus.svg`.
- Render holográfico CSS/SVG con órbitas, scanlines y telemetría.
- 12 hotspots de sistemas interactivos.
- Buscador universal con resultados agrupados de DTC, síntomas, productos, tutoriales y componentes.
- Panel de exploración de componentes con síntomas, comprobaciones, herramientas, DTC y acciones.
- Corregido el recorte del dropdown: `#universalResults` vive en `document.body`, usa posición fija y se recoloca al hacer scroll o redimensionar.
- Corregido el panel de componentes que quedaba en `opacity: 0`.
- Corregido el hero móvil: 860 px de alto, vehículo reposicionado y sin desbordamiento horizontal.

### 2.3 Diagnóstico y síntomas

- `data/symptoms.json` consolidado de 219 a **204 síntomas únicos**.
- Eliminados 15 duplicados por ID y nombre.
- Nueve categorías en `data/symptom-categories.json`.
- Cada síntoma incluye categoría, icono, ámbito genérico, estado de validación, fuente, fecha, DTC y componentes relacionados.
- Filtros por categoría, búsqueda y contador dinámico.
- Detalle de síntoma con DTC relacionados, comprobaciones y aviso de ámbito genérico.
- Corregido el contador de categoría para mostrar “Frenos y chasis” en lugar del ID `frenos-chasis`.
- Corregidos los contadores estáticos de la home que seguían mostrando 219.

### 2.4 Soluciones por sistema

- Nueva pestaña **Soluciones por sistema** dentro de Diagnóstico.
- 12 sistemas con descripción, averías habituales, comprobaciones, DTC y acciones.
- Búsqueda propia con contador “N DE 12 SISTEMAS”.
- Acción “Ver síntomas” que abre la lista filtrada por el nombre del sistema.
- Acciones a tutoriales e IA.
- En móvil se apila en una columna, sin overflow horizontal.

### 2.5 Productos y tutoriales

- Catálogo de 235 productos con foto local y enlace Amazon.es verificado.
- No se presentan referencias OEM, modelos o años no comprobados.
- 193 tutoriales en la biblioteca local, verificados mediante YouTube oEmbed en la fase anterior.
- Sin `YOUTUBE_API_KEY`, la búsqueda remota desde administración permanece deshabilitada; la importación manual y la biblioteca local siguen operativas.

### 2.6 OBD, IA, foro e informe

- OBD conserva gauges, gráfica en vivo y simulador etiquetado como “SIMULADOR VIRTUAL”.
- La lectura real requiere Chrome/Edge, Web Serial o Bluetooth y un ELM327 físico.
- La IA usa el motor experto local como fallback cuando Gemini responde 429.
- Foro e informe se mantienen integrados en la navegación y en el sistema visual nuevo.

## 3. Errores encontrados y corregidos

| Error | Causa | Corrección |
|---|---|---|
| Tutoriales visibles bajo todas las vistas | `.tut-view { display:flex }` anulaba `.view { display:none }` | `.view.tut-view` y `.view.tut-view.active` en `public/css/tutorials.css` |
| Panel de componentes invisible | Animación dejaba `opacity: 0` | Eliminada la animación problemática y forzada visibilidad |
| Dropdown del buscador recortado | Contenedor con overflow | Resultados movidos a `document.body` con posición fija |
| Botones de cierre ocultos | Conflicto con `.icon-btn` | Reglas específicas de visibilidad |
| Recursión al abrir tutoriales | Colisión de nombre `openTutorialSearch` | Separación de la función de navegación y la del modal |
| Vehículo móvil oculto | Altura y posición del hero | Hero de 860 px y vehículo reposicionado |
| 15 síntomas duplicados | IDs y nombres repetidos | Deduplicación y auditoría |
| Relaciones DTC genéricas | Cruce por patrones sin causas/comprobaciones | Solo DTC curados con causas y checks |
| Contador de categoría mostraba el ID | Formateo incompleto | Uso de la etiqueta humana de la categoría |
| Contadores estáticos en 219 | HTML no actualizado | Valores iniciales cambiados a 204 |

## 4. Datos y trazabilidad

### Síntomas

- Registros de entrada: 219.
- Duplicados eliminados: 15.
- Registros finales: **204**.
- Categorías: **9**.
- Con DTC relacionado: **64**.
- Sin DTC relacionado: **140**.
- Relaciones DTC: **120**.
- Con componentes relacionados: **189**.
- Errores de integridad: **0**.

Categorías y conteos:

- Motor y funcionamiento: 37.
- Combustible e inyección: 7.
- Turbo y admisión: 4.
- Anticontaminación: 24.
- Electricidad y electrónica: 20.
- Transmisión y embrague: 18.
- Frenos y chasis: 44.
- Refrigeración y clima: 23.
- Carrocería y confort: 27.

La ausencia de DTC en 140 síntomas es intencionada. No se asignaron códigos por similitud textual ni por patrones genéricos. La ficha se muestra igualmente, pero sin una relación que no esté respaldada.

### Otras fuentes

- DTC: `data/dtc.json`, 9.201 registros. Las relaciones de síntomas solo usan DTC con causas y comprobaciones curadas.
- Tutoriales: 193 vídeos, metadatos y URL verificados con oEmbed en la fase anterior.
- Productos: 235 registros, con foto local y enlace comprobado.
- Componentes: `data/components.json`, 12 sistemas genéricos. No representan compatibilidad por vehículo.
- Auditoría de síntomas: `data/auditoria-sintomas.json`.

## 5. Pruebas y validación

### Pruebas automatizadas

- `npm test`: **68/68 correctas**, 0 fallos, 0 canceladas.
- `npm run symptoms:check`: 204 registros, 9 categorías, 64 con DTC, 140 sin DTC, **0 errores**.
- Duración de la suite: aproximadamente 3,3 s.

### Navegador real

Chromium headless con Playwright:

- 10 vistas: solo la vista activa visible.
- Sin fuga de tutoriales bajo otras vistas.
- Overflow horizontal desktop: 0.
- Overflow horizontal móvil 390 px: 0.
- Errores de consola: 0.
- Home: vehículo correcto, 12 hotspots.
- Buscador P0299: 5 resultados y navegación a `#dtc`.
- Panel de turbo: visible, opacidad 1.
- Síntomas: 204 tarjetas, 10 filtros, Frenos → 44, Turbo → 4, detalle visible.
- Soluciones: 12 tarjetas, 33 chips DTC, búsqueda Frenos → 1 sistema, “Ver síntomas” → 44 resultados.
- Móvil: 204 tarjetas de síntomas y 12 tarjetas de soluciones sin desbordamiento.

Capturas de apoyo, temporales:

- `/tmp/opencode/final-symptoms.png`
- `/tmp/opencode/final-mobile-symptoms.png`
- `/tmp/opencode/solutions-final.png`
- `/tmp/opencode/solutions-mobile.png`

La validación Playwright es manual y no forma parte de `npm test`.

## 6. Estado por requisito

| Requisito | Estado | Nota |
|---|---|---|
| Rediseño visual total | Terminado y probado | Diez vistas, hero, HUD y componentes |
| Vehículo 3D | Alternativa terminada | CSS/SVG interactivo con 12 hotspots, no WebGL |
| Instrumentación | Terminado y probado | Gauges y telemetría; OBD real requiere hardware |
| Todas las pestañas | Terminado y probado | Navegación, estilos y estados revisados |
| Base de síntomas amplia | Parcial y honesta | 204 únicos y enriquecidos; no miles sin fuente |
| Búsqueda/filtros de síntomas | Terminado y probado | 9 categorías y búsqueda |
| Soluciones por sistema | Terminado y probado | 12 sistemas y acciones cruzadas |
| Productos verificados | Terminado | 235 con foto y enlace comprobados |
| Tutoriales | Terminado | 193; búsqueda remota requiere API key |
| IA | Parcial por cuota externa | Fallback local operativo; Gemini 429 |
| Foro | Terminado en fase previa | Integrado visualmente |
| Informe y contacto | Terminado | Integrados en la SPA |
| Móvil | Terminado y probado | 390 px sin overflow |
| Pruebas | Terminado | 68/68 y Playwright |
| Informe final | Terminado | Este documento |

## 7. Límites reales

- No hay modelo 3D licenciado ni WebGL. Se usó un render CSS/SVG original para no depender de recursos externos ni presentar un modelo no verificado.
- No se amplió el catálogo de síntomas a miles de entradas. Hacerlo sin una fuente verificada habría supuesto inventar datos. Las 140 fichas sin DTC se muestran sin relación.
- Gemini sigue devolviendo 429/cuota agotada. El chat y el informe usan el motor local como respaldo.
- Sin `YOUTUBE_API_KEY` no se puede buscar en YouTube desde administración. La verificación oEmbed y la biblioteca local funcionan.
- La lectura OBD real no se probó con un ELM327 físico; sí el simulador.
- El catálogo de 235 productos tarda aproximadamente 1,5–2 s en completar el primer pintado por el volumen del layout. No se optimizó en esta fase.
- El foro es local y no envía correos ni notificaciones push.
- La compatibilidad de productos y componentes es genérica; no se afirma ajuste por marca, modelo o año.

## 8. Ejecución

Requisitos:

- Node.js >= 22.5, por `node:sqlite`.
- Dependencias instaladas con `npm install`.

Arranque:

```bash
cd /home/selupiro/diagnostico-mecanica
npm start
```

URLs:

- `http://localhost:3000/`
- `http://192.168.1.148:3000/`

Servidor validado:

- PID: `185054`
- Comando: `node server.js`
- Log: `/tmp/opencode/dym-server.log`

## 9. Restauración

Para revertir la fase de síntomas:

```bash
tar -tzf backups/pre-sintomas-20261023-030423.tar.gz | head
```

Extraer en un directorio limpio y comparar antes de sobrescribir. Para revertir toda la reforma, usar `backups/pre-reforma-total-20261023-013125.tar.gz`.

Antes de restaurar, detener el servidor:

```bash
kill 185054
```

Los backups excluyen `.env`, `.git`, `node_modules`, bases SQLite y mensajes de contacto cuando así se generaron. Conservar esas rutas o restaurarlas por separado.

## 10. Archivos principales

- `public/index.html`: estructura SPA, hero, buscador, panel de componentes y subpestañas.
- `public/css/reforma.css`: capa visual principal.
- `public/css/tutorials.css`: fix de visibilidad y estilos de tutoriales.
- `public/css/vision.css`: base visual y gauges.
- `public/js/app.js`: navegación, buscador, hotspots, síntomas y soluciones.
- `public/img/hero-car-nexus.svg`: vehículo holográfico.
- `data/components.json`: 12 sistemas.
- `data/symptoms.json`: 204 síntomas únicos.
- `data/symptom-categories.json`: 9 categorías.
- `data/auditoria-sintomas.json`: auditoría y límites.
- `scripts/build-symptoms.mjs`: consolidación y enriquecimiento.
- `scripts/verify-symptoms.mjs`: verificación de integridad.
- `src/routes/api.js`: API de DTC, síntomas, componentes, búsqueda e IA.
- `src/routes/sintomas.js`: endpoint heredado de síntomas.
- `tests/casos.test.mjs`: pruebas de API, síntomas, componentes y buscador.
- `tests/tutoriales.test.mjs`: pruebas de tutoriales.
- `PROGRESO_IA.md`: historial de avances.
- `INFORME_REFORMA_TOTAL.md`: este informe.

## 11. Cierre

La reforma queda cerrada en lo que puede verificarse con el código, los datos y el navegador disponibles. No se creó ningún commit; los cambios permanecen en el árbol de trabajo para revisión.

---

# Actualización posterior — Evolución profesional

Fecha: 2026-10-23 17:30 CEST  
Backup: `backups/pre-evolucion-profesional-20261023-152925.tar.gz`  
SHA256: `0ee8ebdedad9be446d474b822c4652ed813d0bbe9839dc596ae7969904929dae`

Esta sección actualiza y prevalece sobre los recuentos anteriores del informe.

## Estado final

- 9.201 DTC, **454 síntomas**, **500 productos**, **10 vehículos**, **6 guías de tuning** y **10 dossiers técnicos**. `/api/stats` devuelve los seis recuentos, incluida `library`.
- 250 síntomas nuevos revisados; 0 errores en `npm run symptoms:check`.
- 500 productos con ID, nombre, ASIN, foto local y enlace Amazon.es verificados; 0 errores en `scripts/verify-products.mjs`.
- 500 fotos de producto convertidas a WebP 720 px: 15,75 MB. 10 fotos de vehículo en WebP: 1,89 MB.
- Biblioteca técnica con 7 apartados cubiertos y 8 carencias declaradas: esquemas, pares, fluidos, fusibles, sensores, distribución, reparación y campañas.
- Relaciones de vehículo corregidas para que DTC, síntomas y productos sean pertinentes y honestos; los productos llevan aviso de compatibilidad no confirmada.
- Navegación de 13 botones sin overflow de 1920 a 390 px; menú móvil operativo.
- Hero móvil, crédito de imagen, “1 fuente” y auto-scroll de detalle corregidos.

## Pruebas finales

- `npm test`: **75/75**.
- `npm run symptoms:check`: 454 registros, 250 curated, 289 con DTC, 165 sin DTC, 0 errores.
- `node scripts/verify-products.mjs`: 500 productos, 500 imágenes, 500 enlaces, 0 errores.
- Playwright 1440, 1280 y 390 px: 13 vistas, solo la vista activa visible, 0 overflow, 0 imágenes rotas y 0 errores de consola.
- Biblioteca: 10 dossiers, búsqueda “golf” 3, marca Audi 1, sistema EA888 2; detalle con 8 pendientes y 3 fuentes en Golf R.
- Producto: 500 tarjetas, modal visible y cierre con Escape; categoría Herramientas 115.
- Búsqueda universal “golf”: incluye 3 resultados de biblioteca.
- Móvil: menú abre y navega, biblioteca hace scroll al detalle, 0 overflow.

## Archivos principales de esta fase

- `data/symptoms.json`, `data/symptoms-250.tsv`, `data/symptom-categories.json`, `data/auditoria-sintomas.json`.
- `data/products.json`, `data/auditoria-catalogo.json`, `public/img/productos/*.webp`.
- `data/vehicles.json`, `public/img/vehiculos/*.webp`, `data/tuning.json`.
- `data/library.json`, `scripts/build-library.mjs`.
- `src/routes/api.js`, `ia_reasoning.js`.
- `public/index.html`, `public/js/app.js`, `public/css/app.css`, `public/css/reforma.css`.
- `tests/casos.test.mjs`.
- `scripts/expand-symptoms.mjs`, `scripts/build-symptoms.mjs`, `scripts/verify-symptoms.mjs`, `scripts/verify-products.mjs`.

## Limitaciones vigentes

- Gemini sigue en 429/cuota agotada; fallback local operativo.
- Sin `YOUTUBE_API_KEY` no hay búsqueda remota de tutoriales.
- Sin ELM327 físico no hay lectura OBD real.
- El vehículo 3D es un render CSS/SVG interactivo, no WebGL.
- No hay manuales oficiales con licencia para esquemas, pares, capacidades, fusibles, sensores, distribución, reparación ni campañas.
- 265 productos nuevos declaran compatibilidad desconocida; no se atribuyen referencias OEM ni ajustes por vehículo.
- Los JPG originales de productos y vehículos se conservan en disco; el navegador carga WebP.

Servidor final: `node server.js`, PID **215754**, log `/tmp/opencode/dym-server.log`. No se creó commit.
