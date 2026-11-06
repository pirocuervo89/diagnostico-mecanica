# PROGRESO DE LA MISIÓN FINAL

> **Nota de vigencia (29/10/2026):** las secciones que mencionan la Biblioteca técnica son históricas. Esa pestaña se eliminó el 29/10/2026; el estado actual y el motivo están al final del documento.

Fecha: 2026-10-23
Proyecto: `/home/selupiro/diagnostico-mecanica`
Misión actual: cierre de `avance 2` — rediseño visual integral y auditoría del catálogo.

## Base recibida
- Git con cambios pendientes de fases anteriores; no se revirtió ni borró nada.
- Datos reales: 9.201 DTC, 219 síntomas y 235 productos activos tras consolidar 7 duplicados.
- Catálogo: 36 productos con foto local y enlace Amazon.es verificado; 199 pendientes honestos.
- La misión anterior quedó cerrada con 54/54 pruebas y entrega en Escritorio.
- `avance 2` está truncado en la sección 10; no se inventaron los requisitos posteriores.
- Backups previos:
  - `backups/pre-final-mission-20261022-011206.tar.gz` · SHA256 `11b28e15e5c4b355b13ebee171cee7eb959c5291ab57209926996e4a5e94d888`
  - `backups/pre-forum-20261022-153525.tar.gz` · SHA256 `e0364ad5ebbbd6f915d39f9b0f0e06d333c7290b2a1a4f2d3cdceba4a60b0a67`

## Rediseño visual y auditoría del catálogo (avance 2)
- Nuevo sistema visual `public/css/vision.css`: grafito, naranja y cian, tipografía Oxanium/Barlow/JetBrains Mono local, paneles angulares, HUD, gauges y gráficas.
- Home reconstruida con vehículo conceptual SVG original (`public/img/hero-car.svg`), estado real del sistema, selector de vehículo, KPIs, siete módulos de mando, severidad, telemetría y sala de máquinas.
- Selector de vehículo compartido entre home, catálogo, chat, informe y badge; verificado en navegador.
- OBD con gauges y gráfica en vivo; cuando no hay conexión muestra `--` y “SIN SEÑAL DE ECU”. El simulador se etiqueta siempre como “SIMULADOR VIRTUAL”.
- Catálogo rediseñado con 235 productos; en la auditoría previa quedaban 36 fotos/enlaces verificados y 199 fichas pendientes, cerradas después con la verificación masiva.
- Auditoría del catálogo guardada en `INFORME_AUDITORIA_CATALOGO.md` y `data/auditoria-catalogo.json`.
- Duplicados consolidados de 242 a 235 registros; no quedan duplicados por ID, nombre ni enlace.
- 36/36 enlaces comprobados con HTTP 200 y título de Amazon coincidente; 39/39 imágenes originales revisadas visualmente sin discrepancias.
- 0 fichas con referencia OEM/modelo/año verificable; 94 fichas conservan marcas placeholder.
- `npm test`: **54/54 correctas** tras el rediseño.
- Playwright: 9 vistas sin errores de consola; móvil 390 px sin overflow horizontal.
- Informe imprimible verificado en PDF A4 de una página, fondo blanco y sin overlay.
- Backups: `backups/pre-redesign-20261022-213226.tar.gz` (SHA256 `9e68fa3b75f7ca303ace1b8e578f835d240b15bca1eea2c51f4a2f53b8359316`) y `backups/catalogo-pre-auditoria-20261022-220728.json` (SHA256 `a36813124a8d8c281f892ecf979552b1fdf0815364f8df4ca36fea2acd8090fc`).

## Verificación masiva del catálogo (23/10/2026)
- Se completaron las 199 fichas pendientes con anuncios reales de Amazon.es; el catálogo queda con **235/235 productos** con foto local y enlace verificado.
- 199/199 páginas nuevas respondieron HTTP 200; 235/235 ASIN son únicos y 235/235 imágenes activas están presentes y son JPEG válidos.
- Se normalizaron nombre, fabricante y categoría cuando el listado difería, conservando 99 `legacyName`, 85 `legacyManufacturer` y 1 `legacyCategory`.
- `estacion-fap-pro` se movió a `Líquidos y Químicos`; se resolvieron dos ASIN duplicados (`pro-add-6` → `B07PBZQMSW`, `pro-muelles` → `B0HLFST33W`).
- Se sustituyeron fichas que no coincidían con el listado: `liq-wynns-octane` por Motul y `pro-mal-1` por la bolsa Facom BS.T20CM1PG con 27 herramientas.
- Informe actualizado en `INFORME_AUDITORIA_CATALOGO.md` y `data/auditoria-catalogo.json`; backup previo en `backups/catalogo-pre-verificacion-amazon-20261023-000211.json`.
- `npm test`: **54/54 correctas**; navegador real: 235 tarjetas, 235/235 fotos cargadas, 0 errores de consola.

## Foro implementado
- Persistencia SQLite con `node:sqlite` (`DatabaseSync`) en `data/forum.sqlite`; rutas configurables con `FORUM_DB_PATH` y `FORUM_UPLOAD_DIR`.
- 18 categorías técnicas y estados `abierto`, `investigacion`, `solucion_propuesta`, `solucion_verificada` y `cerrado`.
- Cuentas locales con scrypt, sesiones HttpOnly/SameSite=Lax, roles `user`, `moderator` y `admin`; la primera cuenta creada es administradora.
- Casos con vehículo, motor, kilometraje, DTC, síntomas, condiciones, mediciones, pruebas, reparaciones y resultado.
- Respuestas encadenadas, propuestas de solución, votos, valoraciones de 1 a 5 y reputación recalculada.
- Verificación de soluciones solo por moderación, con notas de prueba; al ocultar la solución se retira la verificación.
- Historial de cambios por caso, perfiles públicos, búsqueda por texto/DTC/marca/modelo/motor, filtros por categoría, estado y fecha, y orden por relevancia/fecha/votos/respuestas.
- Mensajes privados entre dos usuarios; solo los participantes pueden leer el hilo.
- Denuncias, cola de moderación, ocultación/restauración de contenido, suspensión temporal y cambio de rol.
- Adjuntos JPG/PNG/WebP/GIF/PDF validados por MIME y magic bytes, máximo 4 archivos de 2 MB; los adjuntos de contenido oculto dejan de ser accesibles.
- Protección antispam: honeypot, límite de enlaces, duplicados recientes, límites por acción y saneado de texto.
- La IA cita `CASO-xxxxx` con nivel de confianza y diferencia soluciones verificadas de propuestas; las referencias aparecen también como panel clicable en el chat.

## Archivos principales del foro
- `src/lib/forum_db.js`: esquema, auth, casos, respuestas, moderación, privados, reputación y conocimiento.
- `src/routes/forum.js`: API REST, permisos, límites y adjuntos.
- `public/js/forum.js`: interfaz completa del foro.
- `public/index.html`, `public/css/app.css` y `public/js/app.js`: vista, estilos, navegación y referencias del chat.
- `server.js` y `src/routes/api.js`: montaje del foro, límite de JSON y conocimiento en chat/OBD.
- `tests/casos.test.mjs`: pruebas de regresión y foro con base de datos temporal aislada.
- `.gitignore`: excluye base de datos, WAL y uploads del foro.

## Pruebas ejecutadas y resultados
- `npm test`: **54/54 correctas**.
- Sintaxis verificada en backend, frontend y pruebas.
- API del foro probada: registro, login, sesión, casos, búsqueda, respuestas encadenadas, votos, ratings, verificación, perfiles, privados, denuncias, moderación, suspensión, adjuntos válidos/falsos y límites.
- Privacidad probada: un tercer usuario recibe 404 al abrir un privado ajeno; los adjuntos ocultos dejan de servirse.
- IA probada con el motor local: cita `CASO-00001`, muestra confianza y distingue propuesta/verificada.
- Navegador real (Chromium headless): listado, detalle, creación/edición de caso con adjunto, respuesta, perfil, privados, moderación y móvil 390 px sin overflow horizontal ni errores de consola.
- Referencias del chat: panel clicable abre el caso interno correspondiente.
- Filtros del foro: categoría, estado, fecha y orden verificados en UI.
- `npm test` se ejecutó también en la entrega anterior; la sincronización final se repetirá con el foro.

## Limitaciones reales
- Catálogo cerrado: 235/235 productos con foto local y enlace Amazon.es verificado; no quedan fichas pendientes.
- 0 productos con referencia OEM/modelo/año verificable y 94 con marcas placeholder; no se presenta compatibilidad no comprobada.
- Gemini sigue con cuota agotada/429; se usa el motor experto local y el circuito de espera.
- Web Serial/Bluetooth requiere Chrome/Edge y hardware ELM327 físico; en esta sesión solo se probó el simulador.
- La instalación es local y sin correo externo: no hay recuperación de contraseña por email ni notificaciones push.
- La base del foro nace vacía en producción; el primer usuario registrado será el administrador.
- El foro no sustituye una diagnosis presencial; las soluciones verificadas son revisadas por moderación, no certificadas por un fabricante.

## Entrega
- Backup previo al foro: `backups/pre-forum-20261022-153525.tar.gz`, SHA256 `e0364ad5ebbbd6f915d39f9b0f0e06d333c7290b2a1a4f2d3cdceba4a60b0a67`.
- Backup final: `backups/foro-final-20261022-164304.tar.gz`, SHA256 `78869d374ff9f93d6b5ce6d30ee042112e25b57e63f39450c420ea29c692f0d2`; incluye base del foro y excluye `.env`, `.git`, `node_modules`, `backups` y mensajes de contacto.
- Entrega sincronizada en `/home/selupiro/Escritorio/Diagnostico-Mecanica`; `rsync --dry-run` sin diferencias y `npm test` en destino: **54/54 correctas**.
- Producción reiniciada en `:3000` con el foro cargado; base vacía con 18 categorías y el primer registro será administrador.
- Requisito de runtime: Node >= 22.5 (`node:sqlite`).

## Cierre avance 2
- Backup final del código y datos: `backups/avance2-final-20261022-225500.tar.gz` · SHA256 en `backups/avance2-final-20261022-225500.tar.gz.sha256`; excluye `.env`, `.git`, `node_modules`, `backups` y mensajes de contacto.
- Backup previo de la entrega: `/home/selupiro/Escritorio/Diagnostico-Mecanica-backup-pre-avance2-20261022-224426.tar.gz` · SHA256 `a5789b912d249ca84014d78fdff8072b32bbc14f14204c91864d0da2880dca9f`.
- Entrega sincronizada en `/home/selupiro/Escritorio/Diagnostico-Mecanica`; segundo `rsync --dry-run` sin diferencias.
- Pruebas en destino: `npm test` **54/54**; 9 vistas sin errores; móvil 390 px sin overflow; OBD simulado en vivo con telemetría.
- Producción origen en `http://localhost:3000` (PID 137241), con catálogo de 235 productos y assets locales respondiendo HTTP 200.

## Biblioteca de tutoriales (23/10/2026)
- Añadidos 20 categorías y 429 subcategorías en `data/tutorial-categories.json`; la semilla cubre 55 subcategorías.
- Creada semilla real `data/tutorials-seed.json` con **193 vídeos**: 190 en español, 2 en inglés y 1 en francés; 161 con advertencias de seguridad; 0 duplicados por ID, URL o título.
- Cada vídeo se verificó con YouTube oEmbed. No se descargaron vídeos ni se inventaron metadatos, compatibilidades o enlaces.
- Implementado `src/lib/tutorial_db.js` con SQLite/WAL, autoimportación, búsqueda, filtros, paginación, sugerencias, favoritos, historial, listas, reportes, moderación, importación y estadísticas.
- Implementado `src/lib/tutorial_providers.js` con parseo de YouTube, verificación oEmbed y búsqueda opcional con `YOUTUBE_API_KEY`.
- Implementado `src/routes/tutorials.js` bajo `/api/tutorials`, con permisos reutilizando la sesión del foro y errores HTTP correctos.
- Integrada la vista completa en `public/index.html`, `public/css/tutorials.css` y `public/js/tutorials.js`.
- Integración funcional con DTC, síntomas, lectura OBD y casos del foro mediante `window.openTutorialSearch()`.
- Panel de administración con categoría, subcategoría, idioma, nivel, fuente y tipo de vehículo explícitos; no se rellenan metadatos por defecto.
- Añadidas 11 pruebas de tutoriales en `tests/tutoriales.test.mjs`: metadatos, búsqueda, filtros, paginación, sugerencias, detalle, visitas, favoritos, historial, listas, reportes, permisos, importación, UPSERT sin duplicados, ocultación y persistencia tras reinicio.
- Navegador real: 193 tutoriales, 24 tarjetas iniciales, búsqueda P0299, modal con iframe, biblioteca, 6 campos de administración, móvil 390 px sin overflow y 0 errores de consola.
- Corregidos dos defectos detectados en navegador: colisión de nombre `openTutorialSearch` que provocaba recursión y botones de cierre de biblioteca/admin ocultos por `.icon-btn`.
- Documentación completa en `TUTORIALES.md`; variables añadidas a `.env.example` y bases SQLite excluidas en `.gitignore`.
- `npm test`: **65/65 correctas** (54 previas + 11 de tutoriales).
- Servidor reiniciado en `:3000` con PID 168642.
- Backup previo al módulo: `backups/pre-tutoriales-20261023-004600.tar.gz` · SHA256 `987f04e61035500a32cf2971bded45de98e20ded9111f5162aeb4365becfc674`.
- Limitación: sin `YOUTUBE_API_KEY` no hay búsqueda remota desde admin; la biblioteca local, la verificación oEmbed y las importaciones manuales siguen operativas.

## Reforma visual total (23/10/2026)
- Backup previo a la reforma: `backups/pre-reforma-total-20261023-013125.tar.gz` · SHA256 `5fb5b1e359091b4a5038ba9368aa741e201ef7a3261d9f13ed2c672efd5acb62`.
- Nueva capa visual `public/css/reforma.css`, cargada después de `tutorials.css`; paleta violeta `#8b5cf6`, cyan `#22d3ee` y magenta `#f472b6`, cristal oscuro, bordes achaflanados y rejilla técnica.
- Recoloreados `public/css/vision.css` y `public/css/tutorials.css`; se conservaron ámbar/rojo para advertencias y peligro. Backups locales de trabajo en `/tmp/vision.before.css` y `/tmp/tutorials.before.css`.
- Nuevo vehículo `public/img/hero-car-nexus.svg`; el hero incorpora render holográfico CSS/SVG, órbitas, scanlines, telemetría y **12 hotspots** de sistemas interactivos.
- Nuevo `data/components.json` con 12 sistemas genéricos (motor, turbo, admisión, EGR, DPF, combustible, distribución, transmisión, frenos, suspensión, sensores y centralita). No representa compatibilidad por vehículo.
- Nuevas rutas `GET /api/components` y `GET /api/search?q=...`, con grupos de DTC, síntomas, productos, tutoriales y componentes.
- Buscador universal en la home con debounce, resultados agrupados, navegación a DTC/síntomas/tutoriales/componentes y resaltado del resultado.
- Panel de exploración de componentes con síntomas, comprobaciones iniciales, herramientas, DTC relacionados y acciones a tutoriales/IA.
- Corregido clipping del dropdown: `#universalResults` se mueve a `document.body`, usa posición fija y se reposiciona al hacer scroll/resize.
- Corregido panel que quedaba en `opacity: 0`; eliminada la animación problemática y forzada visibilidad. El HUD del hero se atenúa al abrir el panel mediante `component-open`.
- Corregida regresión importante: `.tut-view { display:flex }` anulaba `.view { display:none }` y mostraba la biblioteca de tutoriales bajo todas las demás vistas. Añadido `.view.tut-view { display:none }` y `.view.tut-view.active { display:flex }`.
- Mejorado el hero móvil: 860 px de alto y vehículo recolocado para no quedar oculto tras los botones; overflow horizontal 0.
- Añadidas 2 pruebas en `tests/casos.test.mjs` para catálogo de componentes/hotspots y buscador universal.
- `npm test`: **67/67 correctas** (65 previas + 2 nuevas).
- Playwright desktop 1440: título y vehículo correctos, 12 hotspots, búsqueda P0299 con 5 resultados, navegación a `#dtc`, panel de turbo visible con opacidad 1 y 0 errores de consola.
- Playwright móvil 390: overflow 0, buscador de 56 px, vehículo visible y 0 errores de consola.
- Playwright 9 vistas: solo la vista activa visible, sin fuga de tutoriales, overflow desktop 0 y 0 errores de consola.
- Servidor reiniciado en `:3000` con PID 175246; log `/tmp/opencode/dym-server.log`; `/api/health`, `/api/components` y `/api/search?q=P0299` operativos.
- Limitaciones de esta fase: el “3D” es un render CSS/SVG interactivo, no WebGL; `data/symptoms.json` sigue con 219 registros reales y no se amplió de forma masiva; los componentes son información genérica de sistemas, no compatibilidades verificadas.

## Síntomas y soluciones por sistema (23/10/2026)
- Backup previo a la reconstrucción de síntomas: `backups/pre-sintomas-20261023-030423.tar.gz` · SHA256 `2c993d75b47f6dd48040d17806508215d88769fa26eacfe226160294410ba105`.
- `data/symptoms.json` consolidado de 219 a **204 síntomas únicos**; se eliminaron 15 duplicados por ID y nombre. La auditoría queda en `data/auditoria-sintomas.json`.
- Nuevas 9 categorías en `data/symptom-categories.json`: motor, combustible, turbo-admisión, anticontaminación, electricidad, transmisión, frenos-chasis, refrigeración-clima y carrocería-confort.
- Cada síntoma incorpora categoría, icono, ámbito genérico, estado de validación, fuente, fecha de revisión, DTC relacionados y componentes relacionados.
- Relaciones DTC: **64 síntomas con DTC**, **140 sin DTC** y **120 relaciones**. Solo se enlazan DTC que ya tienen causas y comprobaciones curadas; no se generan asociaciones por patrón para evitar falsos positivos.
- Componentes relacionados: **189 síntomas**; el resto no se rellena sin una relación verificable.
- Nuevos `scripts/build-symptoms.mjs` y `scripts/verify-symptoms.mjs`; scripts `npm run symptoms:build` y `npm run symptoms:check`.
- API: filtros `q`, `category` y `system` en `/api/symptoms`; nuevo `/api/symptoms/meta` con categorías, conteos y estadísticas; el endpoint heredado usa las relaciones precalculadas.
- UI de Diagnóstico: 10 filtros (Todas + 9 categorías), contador dinámico, etiqueta de categoría por tarjeta, icono, DTC y estado de validación. El detalle advierte que el ámbito es genérico y no una compatibilidad por vehículo.
- Nueva pestaña **Soluciones por sistema** dentro de Diagnóstico: 12 sistemas, averías habituales, comprobaciones, DTC, búsqueda y acciones a síntomas, tutoriales e IA.
- La cabecera de Diagnóstico muestra “PASO 01 · DIAGNÓSTICO GUIADO” y el estado real “204 síntomas · 12 sistemas”. Los contadores estáticos de la home también se actualizaron a 204.
- Playwright: 204 tarjetas de síntomas, 10 filtros, filtro Frenos → 44, búsqueda Turbo → 4, detalle visible y 0 errores de consola.
- Playwright Soluciones: 12 tarjetas, 33 chips DTC, búsqueda “frenos” → 1 sistema, acción “Ver síntomas” → 44 resultados; móvil 390 px con 12 tarjetas, overflow 0 y 0 errores.
- `npm test`: **68/68 correctas**; `npm run symptoms:check`: 204 registros, 9 categorías, 64 con DTC, 140 sin DTC y **0 errores**.
- Playwright global: 10 vistas, solo la vista activa visible, sin fuga de tutoriales, overflow 0 y 0 errores de consola; móvil 390 con vehículo visible y overflow 0.
- Servidor final en `:3000` con PID **185054**; log `/tmp/opencode/dym-server.log`.
- Limitaciones de esta fase: no se amplió el catálogo a miles de síntomas porque no hay una fuente verificada para hacerlo sin inventar; las 140 fichas sin DTC se muestran sin relación. El 3D sigue siendo CSS/SVG, no WebGL. El catálogo de 235 productos tarda aproximadamente 1,5–2 s en completar el primer pintado por el volumen del layout.
- Informe de cierre: `INFORME_REFORMA_TOTAL.md`.

## Evolución profesional: catálogo, vehículos, biblioteca e imágenes (23/10/2026 17:30)
- Backup previo: `backups/pre-evolucion-profesional-20261023-152925.tar.gz` · SHA256 `0ee8ebdedad9be446d474b822c4652ed813d0bbe9839dc596ae7969904929dae` · restauración comprobada.
- `data/symptoms.json`: **454 síntomas** (204 previos + 250 nuevos revisados), 9 categorías, 289 con DTC, 165 sin DTC, 250 `curated` y 0 errores de validación.
- Pipeline de síntomas: `scripts/expand-symptoms.mjs`, `scripts/build-symptoms.mjs` y `scripts/verify-symptoms.mjs`; `npm run symptoms:check` valida estructura, causas, comprobaciones, herramientas y soluciones.
- Catálogo: **500 productos** (Repuestos 135, Herramientas 115, Líquidos y Químicos 110, Diagnosis 75, Tuning 40, Maquinaria 25); 500 IDs, nombres, ASIN, fotos y enlaces verificados; 0 errores.
- `scripts/verify-products.mjs` valida el catálogo y escribe `data/auditoria-catalogo.json`; 235 compatibilidades declaradas y 265 marcadas como no confirmadas.
- Fichas de vehículo: `data/vehicles.json` con **10 versiones** documentadas, especificaciones, transmisión, emisiones, sistemas, inspección, guía de compra, fuentes y licencias de imagen.
- Tuning: `data/tuning.json` con 3 etapas y 6 guías, sin promesas de potencia, con legalidad, hardware y comprobaciones.
- Biblioteca técnica: `data/library.json` generado por `scripts/build-library.mjs`; 10 dossiers, 7 apartados cubiertos y 8 carencias documentales declaradas. Nuevas rutas `/api/library` y `/api/library/:id`, vista `#biblioteca`, filtros, búsqueda, índice, detalle y acciones cruzadas.
- Relaciones corregidas: síntomas por áreas de inspección, DTC orientativos sin títulos placeholder, productos genéricos de mantenimiento por combustible y aviso explícito de compatibilidad no confirmada.
- Buscador universal y `/api/search` incluyen `vehicles`, `tuning` y `library`; el chat acepta `context.vehicleId` y devuelve el vehículo aplicado.
- Navegación corregida entre 1920 y 390 px: 13 botones, reglas compactas, acciones ocultas cuando no caben y menú móvil operativo; 0 overflow.
- Hero móvil corregido: imagen en flujo, sin solapamiento con la confianza y crédito visible. Auto-scroll al detalle de vehículo/biblioteca en móvil. Corregido “1 fuente”.
- Imágenes: 500 productos convertidos a WebP 720 px (15,75 MB) y 10 vehículos a WebP (1,89 MB); `products.json` y `vehicles.json` apuntan a `.webp`. Backups `data/products.json.pre-webp` y `data/vehicles.json.pre-webp`.
- Biblioteca visual: corregido el buscador, que heredaba `flex-direction: column` de `label`; ahora icono e input están en la misma fila.
- `npm test`: **75/75 correctas**, incluidas pruebas nuevas de biblioteca, búsqueda, filtros y relaciones.
- Playwright: 13 vistas a 1440, 1280 y 390 px; solo la vista activa visible, 0 overflow, 0 imágenes rotas y 0 errores de consola. Biblioteca: 10 iniciales, búsqueda Golf 3, marca Audi 1, sistema EA888 2; modal de producto y scroll móvil verificados.
- Servidor: `node server.js`, PID **215754**, log `/tmp/opencode/dym-server.log`.
- No se creó commit. El árbol de trabajo conserva todos los cambios para revisión.
- Limitaciones: Gemini 429, sin `YOUTUBE_API_KEY`, sin ELM327 físico, sin modelo 3D licenciado y sin manuales oficiales para esquemas/pares/capacidades/fusibles/procedimientos/campañas. La biblioteca declara esas carencias y no inventa valores.

## Remodelación: 3D, escáner y compra (23/10/2026)
- Prompt ejecutado: `/home/selupiro/Escritorio/remodelacion`; informe de cierre en `INFORME_REMODELACION_2026-10-23.md` y copia en el Escritorio.
- Backup previo: `backups/pre-remodelacion-20261023-222635.tar.gz` · SHA256 `052cfb850533dec188f0c3544d3eaeea230f4eb5d61f3995996f2caadde45b0b`; restauración comprobada.
- Añadido hero 3D procedural con Three.js local, iluminación, cámara con órbita/zoom, 12 hotspots, telemetría y fallback WebGL. No es un CAD ni una réplica oficial del Golf R.
- Corregido fallback visible: `.golf3d-fallback[hidden] { display: none !important; }`.
- Portada responsive revisada a 1440/768/390 px: coche debajo del texto en móvil, HUD oculto en ≤920 px y 0 overflow horizontal.
- Añadido `src/lib/document_scan.js`: OCR local, PDF con texto, PDF escaneado, extracción de marca/modelo/año/VIN/motor/cilindrada/potencia/combustible/cambio/emisiones y vínculo con las fichas de vehículo.
- Añadidos `GET /api/vehicle/scan/status` y `POST /api/vehicle/scan`; límite 12 MB, JPG/PNG/WebP/PDF, procesamiento en memoria y sin almacenamiento del documento ni del VIN.
- Añadida la sección `#diagnosisStart` con subida, arrastre, cámara, formulario manual, revisión editable y continuación al diagnóstico.
- Flujo probado: PDF de texto y ficha de imagen; Volkswagen Golf 2018 con OCR `MEDIA-ALTA · 71%`; VIN no forzado si el OCR pierde caracteres; VIN manual inválido rechazado.
- Añadido `GET /api/buying` con 10 fichas y `#view-compra` con búsqueda, filtro de marca y filtro de recomendación (1 recomendable, 7 con condiciones, 2 con precaución).
- Añadidos accesos a compra desde portada, footer y cabecera de vehículos; “Ver ficha completa” y “Diagnosticar esta versión” verificados.
- `/api/chat` identifica la versión por marca/modelo/motor cuando no hay `vehicleId`; corregido el enlace TDI/TSI y la lectura falsa de `IZACI` desde “Motorización”.
- Corregido filtro duplicado de recomendación: “Recomendable” y “Recomendable con condiciones” ya son valores distintos.
- `npm test`: **79/79 correctas**; `npm run symptoms:check`: 454 registros y 0 errores; `verify-products.mjs`: 500 productos y 0 errores.
- QA de 12 vistas a 1440/768/390 px: solo la vista activa visible, 0 overflow y 0 `pageerror`.
- Fallback sin WebGL comprobado en escritorio y móvil: visible, carga oculta y sin errores.
- Servidor final en `:3000` con PID **229330**; log `/tmp/opencode/dym-server.log`.
- **Pendiente crítico**: el lote de 200 averías nuevas documentadas por motor no se ha completado. Solo hay 10 problemas conocidos y 61 puntos de inspección; no se duplicaron los 454 síntomas genéricos para aparentar cobertura. Se necesita documentación fuente y revisión técnica.
- **Pendiente**: ampliar la biblioteca con manuales licenciados, validar OBD con ELM327 físico, configurar Gemini y `YOUTUBE_API_KEY`, y probar WebGL en GPU real.

## Cierre de la remodelación
- Backup final: `backups/remodelacion-final-20261023-231200.tar.gz`; SHA256 en el archivo `.sha256` adjunto, generado después de cerrar el archivo.
- Integridad gzip comprobada y restauración extraída en `/tmp/opencode/restore-final-remodelacion`; archivos clave presentes, sin `.env`, `node_modules` ni adjuntos de usuarios, y sintaxis verificada.
- Informe final: `INFORME_REMODELACION_2026-10-23.md`, copia en `/home/selupiro/Escritorio/INFORME_REMODELACION_2026-10-23.md`.
- El requisito de 200 averías por motor sigue pendiente y se declara explícitamente; no se inventaron registros.

## Fase 2 — biblioteca de 45 categorías, vehículos y OBD ampliado (25/10/2026)
- Backup previo: `backups/pre-fase2-20261023-234025.tar.gz` · SHA256 `4fe70e3d39266e256fb88083b1911e80815087d1240258971739b636fa4ca73e`.
- Biblioteca técnica: **818 entradas únicas**, **45 categorías**, **39 con datos propios**, **6 solo-fuente**, **0 pendientes**; estados `generic=458`, `metadata_only=193`, `reviewed=92`, `verified=45`, `source_only=30`.
- Fuentes: **30**; 29 con HTTP 200 y `src-vw-es-golf-r` con HTTP 0, marcada como no verificada.
- Vehículos: de 10 a **15 fichas**; añadidos Golf IV 1.9 TDI 110, Golf V 2.0 TDI 140, Peugeot 205 1.9 GTI, Peugeot 206 2.0 HDi 90 y Peugeot 308 III 1.5 BlueHDi 130 EAT8. Total: 91 inspecciones, 20 problemas conocidos, 18 referencias de fuente y 16 URL únicas.
- Imágenes nuevas JPG/WebP 1200×800: `golf-iv`, `golf-v`, `peugeot-205`, `peugeot-206` y `peugeot-308`; licencia, crédito y aviso de versión representativa en cada ficha.
- Biblioteca UI: modos “Dossiers” y “45 categorías”; filtros, búsqueda, detalle, fuentes, estados y rail responsive con scroll en tablet/móvil.
- API `/api/technical` con meta, cobertura, fuentes, 30 PID, listado y detalle; integración en `/api/search`, `/api/stats` y chat.
- OBD: parser con **24 PID**, simulador coherente y **8 relojes** (RPM, refrigerante, carga, batería, velocidad, aceite, turbo, lambda) más **25 tarjetas** instantáneas; bloqueo de lecturas solapadas, última lectura y aviso de PID no soportado.
- Corregida la desambiguación del escáner con Golf IV/V y añadidos alias de Peugeot 205/206/308; corregido “1 fuente” en varias vistas.
- `npm test`: **81/81 correctas**; `npm run technical:check` y `npm run symptoms:check` sin errores; 500/500 productos verificados.
- QA Playwright: 14 vistas a 1440/768/390, 0 overflow, 0 imágenes rotas y 0 errores; OBD simulado con 8 relojes y 25 tarjetas; compra con 15 fichas.
- Servidor final en `:3000` con PID **263491**; log `/tmp/opencode/dym-server.log`.
- Informe: `INFORME_FASE2_2026-10-25.md`, copia en el Escritorio.
- Backup final: `backups/fase2-final-20261025-025017.tar.gz`; SHA256 en el archivo `.sha256` adjunto. Integridad gzip y extracción de restauración comprobadas.
- Pendiente declarado: manuales oficiales licenciados, 200 averías nuevas por motor y validación con ELM327 físico. No se inventaron registros.

## Fase 3 — hero 3D real integrado (25/10/2026 11:36)
- Backup previo: `backups/pre-fase3-20261025-103638.tar.gz` · SHA256 `f0dc0a9f5f168068c1e73b918cbb8b5bba578f8dab2fa98836b65db293b08d35`; gzip y firma comprobados.
- Nuevo modelo `public/models/golf-r-75.glb` de **2,78 MB**, basado en un Volkswagen Golf Mk7.5 Highline royalty-free de RigModels; **no es un Golf R oficial**. 11 materiales, Draco, 19 texturas WebP de 1024 px regeneradas desde el GLB original. Licencia y fuente en `asset.extras`.
- `public/js/hero3d.js` sustituye el coche procedural por el GLB real: carga GLTF/Draco local, materiales PBR, entorno PMREM, sombra, luces cian/violeta, cámara orbital, zoom, arrastre, teclado, doble clic y botón “Vista inicial”.
- Añadidos `public/vendor/three/loaders/GLTFLoader.js`, `DRACOLoader.js`, `utils/BufferGeometryUtils.js` y decodificadores Draco locales; sin dependencias externas.
- Materiales corregidos: interior oscuro (eliminaba los arcos de rueda blancos), pintura azul metálica, cristales tintados, llantas metálicas y pilotos con acabado físico.
- Hotspots reposicionados a coordenadas del nuevo modelo; panel de componente, buscador universal y acciones existentes siguen operativos.
- Etiquetas del hero ajustadas a **GOLF 7.5 / Golf VII 2.0 TSI** y aviso de interpretación estilizada; se retiró la afirmación de réplica R exacta.
- Corregido el `pointer-events` del marco 3D: antes el canvas y el botón de reset no podían recibir clic; ahora el arrastre, zoom, reset y doble clic funcionan.
- QA Playwright a 1440/1024/390 px: modelo cargado, 12 hotspots, 0 overflow horizontal, 0 `pageerror`, 0 errores de consola; fallback WebGL verificado; arrastre, reset, búsqueda P0299 y panel “Motor” comprobados.
- `npm test`: **81/81 correctas**.
- Servidor: `node server.js`, PID **263491**.
- Pendiente declarado: el Golf R 7.5 exacto solo se localizó en Sketchfab/Payhip/CGTrader/Blendkit con cuenta o pago; no se usó ninguna cuenta ni pago sin autorización. El hero usa una adaptación estilizada sobre Golf Mk7.5 y se etiqueta como tal.

## Fase 4 — recuperación y cierre de la Biblioteca reconstruida (25/10/2026 13:xx)
- Diagnóstico de la interrupción: no había procesos de descarga, YouTube, node ni navegador bloqueados. El corte se produjo tras generar `data/technical-library.json` (v3) a las 12:50; la API, la interfaz, el verificador y las pruebas seguían esperando el esquema antiguo de 45 categorías/818 entradas. No se perdió ningún dato válido ni fue necesario restaurar copias.
- Reparado el error 500 de `/api/technical/meta`: las entradas de tipo `source` tenían `vehicleIds` sin `vehicleLabel` y rompían el ordenado de vehículos. Ahora solo se listan dossiers/inspecciones con etiqueta.
- `/api/technical/pids` y `/api/technical/pids/:code` pasan a servir los **132 PID importados de OBDex** (CC0-1.0) desde la biblioteca, en lugar de los 30 PID antiguos de `data/obd-pids.json` (que se conserva para la consola OBD).
- Añadidos filtros reales por marca, modelo, generación, año, motor/código, sistema, tipo, estado, categoría y vehículo; `meta` expone los facets y valida tipos/estados desconocidos con HTTP 400.
- Interfaz de Biblioteca actualizada a **27 categorías** y a los nuevos tipos: especificación de modelo, dossier de vehículo, DTC, campaña NHTSA, PID, fuente, tutorial, inspección, guía y documento. Nuevas fichas de detalle para DTC y campañas, y filtros avanzados en la barra.
- Integración con el chat IA: las respuestas muestran hasta 8 referencias técnicas locales con estado y fuente, y permiten abrir la ficha correspondiente en Biblioteca. El API devuelve ahora los títulos de las fuentes, no solo sus IDs.
- Verificador `scripts/verify-technical-library.mjs` reescrito para el esquema v3: 27 categorías, coherencia de recuentos, estados/licencias/disponibilidad, PID, dossiers, fuentes e integridad SHA256 de `data/imports/manifest.json`.
- Dossiers editoriales regenerados desde `vehicles.json`: de 10 a **15** fichas. Textos estáticos de la interfaz alineados con las 27 categorías.
- Estado final de datos: **10.402 entradas** · 9.533 DTC · 132 PID · 281 modelos · 15 dossiers · 91 inspecciones · 193 tutoriales (solo metadatos) · 109 campañas · 44 fuentes · 25 categorías con datos y 2 solo con fuentes.
- `npm test`: **81/81 correctas**. `npm run technical:check`: **0 errores**, integridad de importaciones verificada.
- Pruebas HTTP reales: meta, PID, DTC, campañas, fuentes, filtros por marca/año/sistema y detalle. Pruebas de navegador con Chromium/CDP a 1440, 768 y 390 px: Biblioteca carga 40 tarjetas, 28 botones de categoría, 8 filtros visibles, detalle DTC y de vehículo correctos, 0 overflow horizontal, 0 errores de consola. Smoke test de las 14 vistas a 1440 y 390 px sin regresiones.
- Servidor final en `:3000` con PID **10524**; log `/tmp/opencode/dym-server.log`.
- Pendiente declarado: manuales oficiales licenciados, esquemas eléctricos propios y pinouts verificados siguen sin material redistribuible; los 193 vídeos son solo metadatos enlazados; no se ha usado contenido de pago ni se ha eludido ninguna restricción.

## Auditoría de continuidad y backup previo (25/10/2026 18:50)
- Prompt ejecutado: `/home/selupiro/Escritorio/4`. No es un script: es la instrucción maestra de continuidad; se ejecutó como auditoría de solo lectura seguida de backup.
- No se modificó ningún archivo de código, dato, base de datos ni copia de seguridad durante la auditoría.
- Sintaxis comprobada con `node --check` en 13 archivos (backend, librerías, frontend y pruebas): 0 errores.
- Servidor arrancado con `node server.js`; el anterior PID 10524 ya no existía al empezar la sesión.
- `npm test`: **81/81 correctas**. `npm run technical:check`: **37.114 entradas, 27 categorías, 0 errores**. `npm run symptoms:check`: **454 registros, 0 errores**.
- Endpoints comprobados con HTTP 200: `/api/health`, `/api/stats`, `/api/components`, `/api/symptoms` (+`/meta`), `/api/technical` (+`meta`, `pids`, `coverage`, `sources`), `/api/library`, `/api/buying`, `/api/vehicles` (+detalle y relacionados), `/api/tuning`, `/api/products`, `/api/search`, `/api/dtc/P0299`, `/api/forum/categories|stats|knowledge|cases`, `/api/tutorials` (+`meta`, `stats`, `suggestions`), `/api/vehicle/scan/status`, `/api/ai/status`, `/api/chat` y `/api/obd/analyze`.
- Frontend íntegro: `public/index.html` servido con 96.637 bytes y 17 vistas (no es una página mínima de pruebas), título correcto, 18/18 referencias locales existentes y `public/models/golf-r-75.glb` (2,78 MB) servido.
- Catálogo verificado en estructura: 500 productos, 0 IDs/nombres/ASIN duplicados, 500 enlaces a Amazon.es con ASIN válido en `/dp/`, 500 imágenes locales existentes y 0 rutas rotas. Cinco enlaces elegidos al azar respondieron **HTTP 200** en esta comprobación.
- IA: Gemini respondió **429 RESOURCE_EXHAUSTED** real (`[IA]` en el log); el chat cayó al motor experto local con referencias técnicas, DTC (`P0299`), causas y comprobaciones, sin exponer la clave. `/api/ai/status` informa `google-gemini` / `gemini-3.8-flash`.
- Diagnóstico: `/api/dtc/P0299` devuelve sistema, gravedad, comprobaciones y causas; `/api/obd/analyze` genera informe con `dtcs` + `liveData`.
- Corrección documental: la Fase 4 registró 10.402 entradas, pero `data/technical-library.json` (versión 4, generado el 25/10 a las 13:28) contiene **37.114**: 17.536 especificaciones de modelo, 9.533 DTC, 9.390 DTC de fabricante, 132 PID, 109 campañas, 58 DBC CAN, 15 dossiers, 91 inspecciones, 193 tutoriales y 53 fuentes. Los recuentos de la API y del verificador coinciden con el archivo; era la documentación la que estaba desfasada.
- No se encontraron errores confirmados de código ni datos rotos, así que no hubo reparación que aplicar en esta pasada.
- Backup previo verificado: `backups/pre-auditoria-20261025-185022.tar.gz` · 119 MB · SHA256 `9cd49546eb8942ecf0dc914ab052f73ddbe0dbdcaab108fd7927d845cf6bc872` en el `.sha256` adjunto · `gzip -t` correcto · exclusión de `.env`, `.git`, `node_modules`, `backups`, SQLite y subidas del foro · extracción de `technical-library.json` (138.202.064 bytes) comprobada.
- Riesgos abiertos: todo el trabajo sigue **sin commit** (último commit del 21/09) y `linkStatus: verified` es una marca guardada, no una revalidación de los 500 enlaces en esta sesión.
- Pendiente declarado sin cambios: lote de 200 averías por motor, manuales oficiales licenciados, validación con ELM327 físico y cuota de Gemini.

## Correcciones de la revisión (25/10/2026 19:05)
- Revisión de defectos reales sin borrar ni renombrar ningún archivo. Se comprobaron además: 94 rutas del backend frente a las 52 llamadas del frontend (0 rutas huérfanas), 410 `id` del HTML (0 duplicados), 14 vistas frente al nav (0 destinos inexistentes), 0 funciones duplicadas en `public/js`, 10/10 JSON de datos presentes, 15/15 imágenes de vehículos y los decodificadores DRACO locales.
- **Defecto 1 corregido** (`server.js`): la caída a la página principal devolvía `200 text/html` con el `index.html` para cualquier archivo inexistente (`/js/no-existe.js`, `/img/no-existe.png`, `/favicon.ico`…). Un recurso roto pasaba por correcto y el navegador intentaba ejecutar HTML como JavaScript. Ahora las rutas con extensión de archivo que no existen dan **404**, con un 404 genérico para el resto de rutas no encontradas; las rutas de la aplicación (`/`, `/vehiculos`, `/biblioteca`, `/obd`, `/diagnostico`) siguen devolviendo la página principal con 200.
- **Defecto 2 corregido** (`server.js`): un cuerpo JSON malformado devolvía `500 Error interno del servidor` y se registraba como fallo del servidor. Ahora devuelve **400** («El cuerpo de la petición no es JSON válido») y un cuerpo demasiado grande devuelve **413**; solo los fallos reales se registran y responden 500.
- `.env.example` documenta `GEMINI_API_KEY` y `GEMINI_MODEL`, que el código ya usaba y no aparecían en la plantilla.
- Añadidas 2 pruebas en `tests/casos.test.mjs` para ambos defectos: `npm test` pasa de 81 a **83/83 correctas**.
- Verificado tras reiniciar el servidor: 404 en estáticos inexistentes, 200 en rutas de la app, 200 con su tipo MIME en `app.js`, `app.css`, `golf-r-75.glb` y `draco_decoder.wasm`, 400 en JSON inválido, 404 JSON en `/api` desconocida y 200 en los endpoints principales. Ningún dato, copia de seguridad ni funcionalidad se eliminó.
- Servidor en `:3000` con el código corregido; el punto de retorno sigue siendo `backups/pre-auditoria-20261025-185022.tar.gz`.

## Motor de IA intercambiable (25/10/2026 19:30)
- Nuevo `src/lib/ai_provider.js`: el chat ya no está atado a Gemini. Habla el formato OpenAI (`/chat/completions`) que comparten Groq, OpenRouter, Mistral, Cerebras, Together, DeepSeek, OpenAI y cualquier gateway compatible; Gemini queda como proveedor alternativo heredado.
- Proveedores incluidos: `groq`, `openrouter`, `mistral`, `cerebras`, `openai`, `compatible` (cualquier servicio con `AI_BASE_URL`/`AI_API_KEY`) y `gemini`. Prioridad automática: `AI_API_KEY` > `GROQ_API_KEY` > `OPENROUTER_API_KEY` > `MISTRAL_API_KEY` > `CEREBRAS_API_KEY` > `OPENAI_API_KEY` > `GEMINI_API_KEY`. `AI_PROVIDER`, `AI_MODEL` y `AI_BASE_URL` permiten forzar proveedor, modelo y endpoint sin tocar código.
- `src/routes/api.js` usa ahora `callAI()` y `aiStatus()`; se eliminó el cliente Gemini propio. El motor experto local sigue siendo el respaldo y conserva referencias técnicas, casos del foro y productos recomendados.
- Errores clasificados sin romper la ruta: `quota` (429/402), `auth` (401/403), `provider_error`, `timeout`, `network`, `empty`, `blocked` y `cooldown`. El aviso al usuario está en español y la clave nunca se registra ni se devuelve.
- `/api/ai/status` informa `configured`, `provider`, `providerLabel`, `model`, `fallback` y la lista de proveedores disponibles, sin exponer claves.
- `/api/chat` y `/api/obd/analyze` devuelven `source: 'ai_provider'` con `provider`, `provider_label` y `model`. El frontend acepta `ai_provider` y el antiguo `gemini_ai`, así que las respuestas antiguas siguen mostrándose bien.
- Nuevas `tests/ai_provider.test.mjs` (9 pruebas con un servidor falso): prioridad de proveedores, estado sin claves, formato de la petición (ruta, `Authorization`, modelo, mensajes, límites), truncado `MAX_TOKENS`, clasificación de errores, espera tras fallo y compatibilidad con Gemini. `npm test`: **92/92 correctas**.
- Verificación de extremo a extremo con un proveedor simulado local: una segunda instancia en `:3100` con `AI_PROVIDER=compatible` respondió por `/api/chat` y `/api/obd/analyze` con `source: ai_provider`, `provider: compatible`, `model: mock-model` y 8 referencias técnicas. La instancia y el simulador se detuvieron después.
- Estado real tras reiniciar en `:3000`: solo existe `GEMINI_API_KEY`, así que el proveedor activo sigue siendo Gemini y devuelve 429; el chat cae al motor local con aviso. **Para usar otro proveedor basta añadir su clave al `.env`** (por ejemplo `GROQ_API_KEY`), sin cambiar código.
- `.env.example` documenta todas las variables nuevas y mantiene las antiguas.

## Groq conectado como proveedor real (25/10/2026 19:15)
- La clave se leyó de `/home/selupiro/Escritorio/5`, se validó su formato y se escribió en `.env` como `GROQ_API_KEY` con permisos `600`. No se mostró en ningún mensaje, respuesta HTTP ni log; `.env` sigue excluido de Git y de los backups.
- Modelo por defecto corregido: `llama-3.3-70b-versatile` ya **no existe** en la cuenta (el endpoint `/v1/models` devuelve 11 modelos). El preset de Groq usa ahora `openai/gpt-oss-120b`.
- `reasoning_effort=low` para modelos de razonamiento (gpt-oss, qwen3, o-series, configurable con `AI_REASONING_EFFORT`): el razonamiento bajó a 6–18 tokens por respuesta, dejando el presupuesto al texto útil.
- Límite real detectado: **8.000 tokens por minuto** en la capa gratuita para ese modelo, contando prompt + reserva de respuesta. Por eso `max_tokens: 8192` devuelve 429. Se mantiene 4.096 y se recorta el bloque de referencias que va en el prompt (6 entradas, resúmenes de 240 caracteres); la respuesta al usuario sigue devolviendo las 8 referencias completas.
- Tiempos de espera ampliados: 40 s en `/api/chat` y 45 s en `/api/obd/analyze` (antes 15 s, que cortaban respuestas largas a medio escribir).
- Espera tras fallo: se respeta la cabecera `Retry-After` del proveedor (entre 1 y 120 s) y el mínimo por defecto baja de 5 minutos a 60 s; solo un error de clave mantiene 5 minutos.
- Registro de consumo: cada llamada deja `[IA] Groq: prompt=… completion=…` en el log, sin claves, para poder medir la cuota real.
- Pruebas con la API real: consulta de P0299 en Golf 7 GTI → `finish: STOP`, 11.283 caracteres, 9,3 s, 8 referencias y 3 productos; segunda consulta inmediata también correcta; el tercer informe OBD dio 429 y cayó al motor local (3.800 caracteres) y se recuperó a los ~25 s con informe de IA de 9.545 caracteres.
- Frontend: el chat y el informe indican el proveedor («Respuesta generada por IA (Groq)») y siguen aceptando el valor antiguo `gemini_ai`.
- Aislamiento de pruebas corregido: la suite arranca el servidor con todas las claves de IA vacías, así no lee el `.env` real ni gasta cuota. `npm test`: **92/92 correctas**.
- Backup posterior: `backups/post-ia-20261025-191801.tar.gz` · 119 MB · SHA256 `211c443d254873b69ce27a90dfb6979c1d3329216ad3e09f6489cea3266f4564` · sin `.env`.
- Limitación declarada: con 8.000 TPM la capa gratuita admite unas dos consultas largas por minuto; la siguiente cae al motor local durante menos de un minuto. Es cuota del proveedor, no un fallo de la aplicación.

## Limpieza del equipo y backups (25/10/2026 19:30)
- Espacio liberado: **13 GB** (disco del 50 % al 38 % de uso; de 55 GB ocupados a 42 GB, con 70 GB libres).
- Backups del proyecto: de 54 archivos / 1,0 GB a **3 archivos / 357 MB**. Se conservan `pre-auditoria-20261025-185022`, `post-ia-20261025-191801` y `estado-pre-limpieza-20261025-192736` (creado justo antes de esta limpieza). Se borraron 29 archivos antiguos y sus `.sha256`.
- Tor Browser eliminado por indicación del usuario: programa en `~/Descargas/tor-browser` (406 MB), el `.tar.xz` de instalación (132 MB), la caché (`~/.cache/torbrowser`) y el lanzador del escritorio.
- Docker: eliminados el contenedor `open-webui` y su imagen de 7,16 GB (parados desde hacía 5 semanas). **Se conservó el volumen `open-webui` (1,1 GB)** con sus datos.
- Cachés vaciadas: `pip` (3,5 GB), `npm` (950 MB), caché de navegador Firefox (1,1 GB, con Firefox cerrado comprobado) y temporales `/tmp/opencode` (146 MB).
- No se tocaron archivos personales: firmware `SAMFW.COM_SM-T210…zip` (844 MB) ni los scripts de `~/Descargas`, y se conservaron los navegadores de Playwright (658 MB) porque hacen falta para las pruebas de interfaz.
- `/tmp/node-compile-cache` (7 MB) no se pudo borrar por permisos; es inofensivo y el sistema lo limpia al reiniciar.
- La aplicación quedó intacta: `npm test` 92/92 y la web respondiendo 200 en `:3000`.

## Continuación de `base 1`: cobertura honesta de la biblioteca (25/10/2026 20:00)
- Punto de partida localizado: la sesión anterior se cortó entre 14:25 y 14:28, después de descargar las 7 fuentes y reconstruir la biblioteca (37.114 entradas). No se había perdido ningún dato.
- Defecto corregido: las categorías sumaban entradas propias + relacionadas, así que «Pares de apriete» anunciaba 16.362 entradas cuando tenía **0**, y al abrirla aparecían fichas de homologación de la EEA (Abarth 500E, SEAT Arona…). Lo mismo en conectores, sensores, tensiones, ECU, manuales, esquemas y ADAS.
- Corrección en la fuente (`scripts/build-technical-library.mjs`): `dataCount`, `sourceCount`, disponibilidad y estados se calculan solo con entradas propias; se añade `relatedDataCount` y la cobertura `related` («Solo relaciones»). El verificador informa de esa cuarta cobertura y el resumen del build ya no omite las categorías solo-relacionadas.
- Interfaz (`public/js/app.js`, `public/css/reforma.css`): las tarjetas muestran el número propio y `+N` relacionadas; las fichas que aparecen por relación llevan la etiqueta «Relacionada»; la cabecera dice «N con datos · M solo relaciones». Nueva prueba en `tests/casos.test.mjs` que fija el comportamiento.
- Cobertura resultante: **17 categorías con datos propios, 2 solo con fuentes, 8 solo con relaciones, 0 pendientes** (antes se anunciaban 25 «con datos»).
- Biblioteca reconstruida en ~20 s sin bloquear el equipo: 37.114 entradas, 27 categorías, 16.066 fichas EEA con sus 75.733 variantes dentro, 9.533 DTC genéricos, 9.390 de fabricante, 132 PID, 58 DBC, 109 campañas.
- `npm test`: **92/92**. `npm run technical:check`: **0 errores**. Filtros comprobados por API: SEAT (151), `obd-dtc-pids` (19.074 propias) y `torque-specs` (16.365 relacionadas, todas marcadas).
- Informe completo: `INFORME_BIBLIOTECA_BASE1.md`.
- Pendiente declarado sin inventar: pares de apriete, esquemas, pinouts, curvas de sensores y manuales propios (0 entradas, sin material redistribuible), ADAS, documentación de fabricante europeo y NHTSA vPIC (fuente estadounidense, no importada para no diluir el catálogo europeo).

## Tuning y catálogo de recambios (2026-10-25)

- **Tuning**: eliminadas las 4 guías colgadas de un coche concreto (Golf R, GTI, TDI, 320d). Se mantienen tres guías genéricas y se reescriben las etapas Stage 1/2/3 con palancas reales de potencia, hardware, software, límites, comprobaciones, mitos, legalidad y fuentes verificadas.
- **Nueva pestaña Recambios** (`#tuning-productos`): 134 piezas en 14 categorías, 21 coches europeos, búsqueda, filtro por coche, pestañas por categoría y 327 enlaces de compra.
- Las fotos son de referencia (Wikimedia Commons CC0/CC BY/CC BY-SA) porque no hay cuenta de afiliado. Los enlaces son búsquedas funcionales en AliExpress, Temu y, cuando existe, la web de la marca.
- Generación del catálogo: `node scripts/build-products.mjs`. Fotos: `node scripts/fetch-product-images.mjs [--force]`.
- Al dar de alta AliExpress Portals o Temu Affiliate, añadir el parámetro de tracking en `links[].url` de `data/tuning-products.json`.
- **Límite declarado**: 134 fichas revisadas, no 2.000. Escalar exige feed de afiliado con fotos y stock reales.

## Recambios: sección visible y catálogo completo (2026-10-26)

- **Fallo encontrado**: la sección existía y cargaba las 134 fichas, pero `.view.active` arrancaba en `opacity: 0` con `animation-fill-mode: both`. Si el navegador no avanza la animación de entrada (pestaña en segundo plano, equipo lento, compositor bloqueado), la vista se queda invisible: parece que «no carga». Comprobado en navegador real: contenido en el DOM, sección a 0 de opacidad.
- **Corrección** (`public/css/reforma.css`): la animación de entrada ya no toca la opacidad, solo desplaza el bloque (`viewInSafe`). Con movimiento reducido se desactiva del todo. Verificado: opacidad 1 aunque la animación esté congelada.
- **Caché de recursos**: los CSS y JS se sirven con `?v=20261026b` desde `public/index.html`, así una recarga normal no puede quedarse con un `app.js` antiguo sin la sección.
- **Catálogo completo**: `scripts/build-products.mjs` incorpora las **40 piezas de tuning que ya estaban** en el catálogo de tienda (`data/products.json`, categoría Tuning, con foto y enlace de Amazon verificados) y las reparte por categoría. Total: **174 piezas en 17 categorías** (3 nuevas: Interior y volantes, Aceites y fluidos, Transmisión y embrague).
- **Interfaz**: las fichas de tienda llevan la etiqueta «Foto de tienda» en lugar de «Foto de referencia», los títulos largos se recortan a dos líneas con el nombre completo en el `title`, y si el catálogo no responde aparece el motivo y un botón **Reintentar** (con corte a los 15 s).
- **Verificado**: navegador real a 1440 y 390 px (174 tarjetas, 18 pestañas, 0 imágenes rotas, 0 errores de consola), `/api/tuning-products` 174 fichas y `npm test` **93/93**.

## MOD 3 — Fiabilidad terminada y ampliada (27/10/2026)

- **Dónde se quedó MOD 2**: el backend (`/api/reliability`, `/api/reliability/:id`, buscador universal y contexto de la IA), el HTML de la vista y el CSS estaban hechos, pero `public/js/app.js` no tenía ningún cargador para la pestaña Fiabilidad. Al abrirla se quedaba en «Cargando base de fiabilidad…».
- **Completado en `public/js/app.js`**: carga bajo demanda desde `viewchange`, tarjetas por motor, filtros (texto, marca, motor, año y estado), leyenda de estados, contador, ficha de detalle con averías, comprobaciones, costes, mantenimiento y fuentes, y botón para preguntar a la IA por el motor. Verificado en Chromium real: 8 tarjetas, filtro de marca, búsqueda por «cadena», apertura de ficha y 0 errores de consola.
- **Base ampliada**: de 6 a **8 motores** y de 24 a **31 averías** con Mercedes-Benz OM651 2.1 CDI (5 averías) y Renault/Dacia/Nissan 1.2 TCe H5Ft (2 averías). OM651 queda enlazado a `mercedes-c220d-w205`. Cada avería declara estado, gravedad, síntomas, causa, comprobaciones, solución, riesgo, coste orientativo en España y fuentes https.
- **Pruebas**: nueva prueba en `tests/casos.test.mjs` (estructura, estados, costes, fuentes, filtros, detalle, 404 y buscador universal). `npm test`: **95/95**. `node --check` sin errores en `public/js/app.js` y `src/routes/api.js`.
- **Pendiente declarado**: no se añadieron MG, BYD, OMODA, JAECOO ni EBRO porque no se localizaron fuentes verificables de averías por motor y generación; no se inventaron datos. La campaña del retén del OM651 de 2014 se marca como reportada y debe confirmarse por VIN.

## OBD-II completo, máquinas verificadas y catálogo real de tienda (27/10/2026)

- **Protocolos OBD-II**: nuevo `data/obd-protocols.json` con ATSP0–ATSP9 y ATSPA (J1939), con bus, pines, vehículos habituales, estado y nota. Nuevo `GET /api/obd/protocols`. El selector de la vista OBD se rellena desde la API y el ELM327 envía el protocolo elegido; si el adaptador lo rechaza, vuelve a ATSP0. El simulador aplica el protocolo y lo devuelve en `ATDP`.
- **Compatibilidad BLE ampliada** en `public/js/obd.js`: filtros para Vgate, Veepeak, OBDLink, Konnwei y V-Link, más el servicio Nordic UART. Sin esto, adaptadores BLE habituales no aparecían en el diálogo del navegador.
- **Máquinas de diagnosis**: nuevo `data/diagnostic-scanners.json` y `GET /api/obd/scanners` con **12 equipos reales** de Amazon.es, ordenados de mejor a peor por cobertura, bidireccionalidad, funciones, conectividad y precio. Incluye escáneres de mano (Launch X431 PROS V5, Autel MK808BT PRO, Launch CRP919X BT, iCarsoft CR Pro, Foxwell NT530, Autel AP200, TOPDON AD600S, ANCEL AD410) y adaptadores (Vgate vLinker MC+, Vgate iCar Pro 2S, Veepeak BLE+, Vgate vLinker FS). Cada ficha lleva precio comprobado el 27/10/2026, stock, foto local, enlace directo, puntos fuertes, límites y nota de verificación. Solo los adaptadores BLE/USB se marcan como compatibles con esta web. El 29/10/2026 esta lista se sustituyó por los **5 adaptadores compatibles** descritos al final del documento.
- **Catálogo de tuning reconstruido**: `scripts/build-store-catalog.mjs` genera **168 productos reales de Amazon.es en 17 categorías**, todos con foto del vendedor descargada en `public/img/tienda/<ASIN>.jpg`, precio, enlace directo `/dp/ASIN`, consulta y enlaces secundarios. Se conservaron las 40 fichas de tienda válidas y se descartaron las que estaban mal categorizadas (bujías en electrónica, limpiadores en llantas, aceites de moto en lubricantes). El catálogo curado anterior (174 fichas con fotos Wikimedia) queda archivado en `data/tuning-products.curated.json`.
- **Fichas universales**: las nuevas fichas declaran `cars: []` y un aviso de verificación de medida/referencia. El filtro por coche muestra las universales con cualquier modelo y la interfaz lo explica; el aviso legal y la cabecera ya no hablan de fotos de referencia.
- **Verificado en Chromium real**: 11 protocolos en el selector y en las tarjetas, 12 máquinas, simulador conectado con ATSP3 y estado «ISO 9141-2», 168 tarjetas de tuning, fotos locales existentes, etiqueta «Foto del vendedor», 0 imágenes con archivo ausente. `npm test`: **99/99**. `node --check` correcto en `public/js/app.js`, `public/js/obd.js`, `src/routes/api.js`, `scripts/build-store-catalog.mjs` y `tests/casos.test.mjs`.
- **Límite declarado**: los precios y el stock de Amazon pueden cambiar; las fichas nuevas son universales o de aplicación amplia y no sustituyen la comprobación de referencia por VIN. No hay cuenta de afiliado: los enlaces son directos, sin tracking.
- **Backup**: `backups/mod4-obd-tienda-20261027-155952.tar.gz` · 38 MB · SHA256 `a92205f4fe312a0b78f21bd0736c399081d2498ffd1171859e22996121685526` · sin `.env`; incluye los datos nuevos, las 196 fotos de tienda y los cambios de código/pruebas.
- **Caché del frontend**: `app.js`, `obd.js` y `reforma.css` se sirven como `?v=20261027a` para que una recarga normal no conserve la versión anterior.
- **Detalle de consola**: añadido `public/favicon.svg` con el emblema de la marca y su `<link rel="icon">`; desaparece el 404 de `/favicon.ico` y la consola queda limpia.

## OBD-II: solo adaptadores compatibles, arriba y por precio (29/10/2026)

- **Datos**: `data/diagnostic-scanners.json` se redujo de 12 equipos a **5 adaptadores compactos** sin pantalla ni app propietaria. Todos son `forWeb: true` y declaran los 10 protocolos OBD-II de turismo (ATSP0–ATSP9) más J1939 (ATSPA). Se excluyeron los escáneres de mano y los ELM327 Bluetooth clásicos, que no pueden comunicarse con la web.
- **ELM327 más barato**: añadido el **ELM327 USB V1.5** de Amazon.es (`B0BW9DFPWN`, 20,99 €, en stock el 29/10/2026), con foto local. Es la opción más barata verificada para Web Serial; el ELM327 Bluetooth de 8–10 € queda fuera porque Web Bluetooth solo admite BLE.
- **API**: `/api/obd/scanners` devuelve solo los 5 adaptadores, `protocolCoverageNote` y `rankings.price` de más barato a más caro (20,99 € → 70,99 €).
- **Interfaz** (`public/index.html`, `public/js/app.js`, `public/css/reforma.css`): la lista **«Dispositivos para usar la web»** queda arriba del todo de la pestaña OBD-II, antes de la conexión. Se eliminaron las pestañas, el filtro y la sección inferior de máquinas. La primera tarjeta lleva la etiqueta **Más barato**.
- **Verificado**: `npm test` **100/100** (nueva prueba de orden y ausencia de escáneres), API con 5 adaptadores en orden ascendente y `node --check` en `public/js/app.js`. En Chromium real: 5 tarjetas, ELM327 primero con etiqueta «Más barato», lista antes de la configuración, 0 errores de consola y 0 desbordamiento a 390 px. Caché del frontend: `?v=20261029b`.

## Biblioteca técnica: solo Golf IV, dossier profundo y 27 categorías (29/10/2026)

- **Punto de partida**: la tarea anterior se cortó a medias. Existían las cuatro fotos del Golf IV en `public/img/vehiculos/golf-iv/`, pero no había dossier en `data/library.json` ni vista que lo mostrara.
- **Datos** (`data/library.json`): la biblioteca de vehículos queda con **un único dossier, `vw-golf-iv`** (Mk4/1J, 1997–2004). Contiene 24 motorizaciones (1.4 a 2.8 VR6, diésel 1.9 SDI/TDI VE/TDI PD), **52 fusibles** repartidos en las tres cajas (salpicadero, batería y placa de relés), **3 centralitas** con 7 pines documentados cada una (ME7.5, EDC15 y EDC15P), **3 procedimientos de calado** (1.9 TDI VE, 1.9 TDI PD y 1.8T 20V), **22 averías** con síntoma, comprobación y coste, **24 filas de fiabilidad** por motor, **15 fuentes** y **5 carencias** declaradas. Nada de valores inventados: lo que no se pudo verificar se declara como pendiente.
- **API** (`src/routes/api.js`): `/api/library?mode=dossiers` devuelve solo el dossier del Golf IV con los contadores de cada sección; `/api/library/vw-golf-iv` entrega el dossier completo. Las 27 categorías técnicas siguen disponibles en el modo `technical`.
- **Interfaz** (`public/index.html`, `public/js/app.js`, `public/css/reforma.css`): la pestaña **Biblioteca técnica** abre con las 27 categorías y un segundo modo **Dossier Golf IV**. El dossier lleva foto local, ficha del vehículo, índice lateral fijo con los ocho apartados y su contador, navegación por secciones, tablas de fusibles con buscador, selector de caja de fusibles y de centralita, esquemas de calado ampliables, filtro de averías por gravedad, comparativa de fiabilidad y botones que envían una consulta a la IA con el Golf IV como vehículo activo.
- **Imágenes**: las cuatro fotos descargadas (hero, ubicación de fusibles, ECU ME7 y motor 1.9 TDI) más seis esquemas SVG originales (tres calados y tres cajas de fusibles). Los esquemas son funcionales, no a escala, y se declaran como tales.
- **Verificado**: `npm test` **100/100**, incluidas las pruebas nuevas del dossier (estructura, contadores, fuentes y ficheros de imagen existentes). En Chromium real: dossier a 1440 y 390 px sin desbordamiento, índice lateral correcto, esquema de calado ampliable con imagen de 980×580, y el botón de IA cambia al chat con la pregunta del Golf IV y respuesta del motor experto local. 0 errores de consola. Caché del frontend: `?v=20261029d`.
- **Límite declarado**: los pineados de centralita y las tablas de fusibles son los publicados en fuentes públicas; no sustituyen al manual oficial ni al esquema por VIN. Las 27 categorías técnicas conservan su estado de cobertura y sus fuentes.

## Biblioteca técnica eliminada (29/10/2026)

- **Decisión**: se retira la pestaña **Biblioteca técnica** completa. No se puede mantener la promesa de una biblioteca de taller con cobertura universal, y el contador de 37.114 entradas mezclaba cosas muy distintas: 17.536 fichas de homologación de la EEA, 18.923 códigos DTC, 132 PID, 109 campañas, 58 DBC, 193 tutoriales y solo 15 dossiers, 4 guías y 91 inspecciones. Además, 36.623 fichas figuraban como «revisadas» siendo importaciones masivas.
- **Frontend**: eliminados el botón del menú y del pie, la vista `#view-biblioteca`, el conmutador de modos, el dossier del Golf IV y toda la lógica JS asociada (carga, filtros, detalle, calados, fusibles, centralitas, averías y fiabilidad). También se retiraron los resultados de biblioteca del buscador universal y las referencias técnicas del chat.
- **Backend**: eliminadas las rutas `/api/library` y `/api/library/:id`, el router `/api/technical`, la integración en `/api/search`, `/api/stats` y `/api/chat`, y las funciones `readLibrary`, `librarySummary`, `technicalReferencesFor` y `technicalKnowledgeBlock`.
- **Datos y scripts**: borrados `data/library.json`, `data/technical-library.json` (132 MB), `data/technical-sources.json`, `data/technical-categories.json`, `data/technical-guides.json`, `data/imports/` (47 MB), `src/routes/technical.js` y los scripts `build-library.mjs`, `build-technical-library.mjs`, `verify-technical-library.mjs`, `import-base1.mjs` e `import-biblioteca.mjs`. La ficha normal del Golf IV 1.9 TDI 110 se conserva en `data/vehicles.json`.
- **Pruebas**: eliminadas las tres pruebas de biblioteca y los asserts asociados; el buscador universal ya solo comprueba vehículos y tuning. `npm test`: **97/97**.
- **Copia de seguridad**: `backups/biblioteca-tecnica-20261029.tar.gz` · 12 MB · SHA256 `e6651248b694dc7ceff07d3dac4e83498c33b91818962a1b6053fee071bb061a`, con los datos, importaciones, scripts, rutas y el código previo.
- **Pendiente declarado**: si se retoma la documentación por vehículo, debe hacerse con datos licenciados o aportaciones con moderación, y con contadores que separen datos de homologación, DTC y procedimientos reales.
- **Regresión corregida**: al borrar la biblioteca se eliminó `foldText`, que seguía usando el buscador de Recambios. Se restauró como utilidad global; verificado con el filtro «turbo» (168 → 23 piezas).
- **CSS restaurado**: el mismo borrado había eliminado estilos de adaptadores OBD, recambios, fiabilidad, etapas de tuning y encuadre del héroe. Se recuperó el bloque no perteneciente a la biblioteca desde la copia de seguridad. Las fotos de los adaptadores OBD quedan en **120 px** de escritorio y **84 px** en móvil, con `object-fit: contain`, sin desbordamiento ni imágenes gigantes.
- **Fiabilidad ampliada**: tarjetas de motor con más padding (22 px), títulos a 23 px y texto a 14,5 px, filtros y leyenda más grandes y 20 px de separación. En móvil se mantiene una columna sin desbordamiento.
- **Caché actual del frontend**: `?v=20261029h`.
- **Verificado en navegador real**: 15 vistas a 1440 y 390 px, 0 desbordamientos, 0 imágenes rotas, 0 errores de consola y 0 respuestas 404; flujos de DTC, síntomas, tutoriales, productos, tuning, recambios, fiabilidad, vehículos, OBD simulado y foro. `npm test`: **97/97**.

## Fiabilidad: primer bloque de ampliación, 4 motores (30/10/2026)

- **Objetivo**: empezar la cobertura de 30 motores, cerrando bloques completos y sin dejar fichas a medias. Este primer bloque añade **4 motores y 19 averías**.
- **Nuevos motores**:
  - `vag-ea211-10-14-tsi` — EA211 1.0/1.4 TSI (2012–2020). 5 averías: bomba/termostato de plástico, wastegate, carbonilla de admisión, correa con intervalo realista y válvula PCV.
  - `vag-ea189-16-20-tdi` — EA189 1.6/2.0 TDI (2007–2015). 5 averías: EGR/admisión, DPF, inyectores piezo y retornos, correa/bomba y actuador de palomillas P2015.
  - `psa-dv6-16-hdi` — DV6 1.6 HDi/TDCi (2004–2019). 5 averías: turbo por obstrucción del conducto de aceite, asientos de inyector («black death»), EGR, DPF/Eolys y correa.
  - `renault-k4m-16-16v` — K4M 1.6 16V (1998–2017). 4 averías: polea de distribución variable, bobinas, correa/bomba y sensor TDC.
- **Cobertura resultante**: **12 motores**, **50 averías**, **16 marcas** y unas **64 referencias de modelo** citadas (≈70 contando variantes). Fuentes únicas del conjunto: **46**.
- **Criterio**: cada avería lleva síntomas, causa, comprobaciones, solución, riesgo, estado (`reportada`, salvo confirmación oficial), coste orientativo y fuentes https. Los intervalos de correa se dan por versión, no como una cifra universal.
- **Límites declarados**: 4 de los 22 motores que faltan para llegar a 30. Las fuentes que bloquean clientes automáticos (403/429/406) llevan `accessNote` para abrirse en el navegador. No se han inventado averías para completar un número: el K4M queda con 4 porque no había una quinta con documentación suficiente.
- **Verificado**: `/api/reliability` devuelve `stats.engines = 12` y `stats.issues = 50`; las 12 fichas de detalle responden 200; filtros `brand=Peugeot` (2 motores), `q=turbo` (10), `year=2010` (7) y `engine=renault-k4m-16-16v` (1). En Firefox real: 12 tarjetas, 16 marcas en el filtro, 0 desbordamiento a 1440 y 390 px, 0 imágenes rotas, 0 errores JS; ficha del DV6 con 5 averías, 4 bloques de mantenimiento y 20 enlaces a fuentes. `npm test`: **97/97**.
- **Caché del frontend**: `?v=20261030a` (solo cambia la referencia; los datos se leen del servidor).
- **Consumo estimado**: el bloque añade ~93 KB de datos (~25.000 tokens de escritura) y, sumando búsquedas y lectura de fuentes, unas 70.000–90.000 tokens por bloque de 4 motores. No hay contador de cupo visible en la sesión; con ese ritmo, los 18 motores restantes son 5–6 bloques más.

## Mi garaje: módulo privado de vehículos (30/10/2026)

- **Qué se añadió**: pestaña **Mi garaje**, privada por cuenta (la misma del foro). Cada usuario guarda sus coches con ficha (matrícula, VIN, código de motor, cilindrada, potencia, plazas, masa, primera matriculación), foto, mantenimientos con aviso por fecha o kilómetros, averías con DTC y causa confirmada, historial, documentos privados (ficha técnica, facturas, PDF) y un asistente que recibe el historial real del coche.
- **Datos** (`src/lib/garage_db.js`): tablas `garage_vehicles`, `garage_events` y `garage_documents` sobre la base del foro, con índices por usuario y vehículo. Límites: 25 vehículos por cuenta, 60 documentos por vehículo, 6 MB por foto y 8 MB por documento, validando la cabecera real del archivo (JPG, PNG, WebP y PDF). Los archivos se sirven solo al propietario con `Cache-Control: private, no-store`. Borrar un vehículo elimina en cascada eventos, documentos y ficheros.
- **API** (`src/routes/garage.js`): alta, edición y borrado con confirmación explícita; foto; eventos de mantenimiento, avería, reparación, ITV, modificación y gasto; documentos; y un límite de 120 escrituras cada 10 minutos por cuenta. Sin sesión, todo responde 401; un vehículo ajeno responde 404.
- **Mantenimiento documentado**: el coche se enlaza con `data/engine-reliability.json` (12 motores) por **código de motor** y, si no consta, por marca, cilindrada y combustible. Los intervalos mostrados llevan su fuente y nunca se rellenan a mano.
- **Corrección de un fallo real**: el emparejamiento solo por marca y cilindrada asignaba el EA189 a un Golf 2.0 TDI **CRLB** (que es EA288), mostrando la correa, la EGR y los filtros de otra familia. Ahora, si el vehículo declara un código que no está documentado, no se enlaza ningún motor y se dice qué código falta; si no hay código, el aviso indica que los intervalos son de una motorización equivalente y que deben confirmarse con el libro de la versión.
- **Interfaz** (`public/index.html`, `public/js/garage.js`, `public/css/reforma.css`): vista `#view-garaje` con acceso/registro, rejilla de coches, ficha con 6 pestañas (Ficha, Mantenimiento, Averías, Historial, Documentos, Asistente IA), formulario manual de 16 campos, lectura de la ficha técnica por OCR (`/api/vehicle/scan`), reducción de fotos a 1600 px antes de subirlas y VIN enmascarado salvo que se pida verlo.
- **Verificado en Firefox real**: **una sola instancia headless con perfil nuevo** (el bucle de 10 perfiles que se usó antes agotó la memoria del equipo; ahora se borra el perfil al terminar). Flujo completo: registro 201, alta 201, tarjeta con matrícula normalizada (`1234ABC`), ficha con 16 datos técnicos y 6 pestañas, mantenimiento guardado con aviso de próximo cambio, avería P0401 en el historial, 2 filas de historial con filtro, documento PDF subido y servido, respuesta del motor experto local en la pestaña IA, alta manual con 16 campos, **0 desbordamiento horizontal a 1360 px y 0 errores de consola**.
- **Las dos ramas del motor, en el navegador**: con un código documentado (SEAT León 1.6 TDI, **CAYC**) la ficha muestra **4 intervalos con 4 enlaces a fuentes** bajo el epígrafe del EA189; con un código que no está en la base (Golf 2.0 TDI, **CRLB**) muestra **0 intervalos** y el aviso «El código de motor CRLB no está todavía en la base documentada de fiabilidad».
- **Pruebas**: `tests/garaje.test.mjs` cubre sesión obligatoria, validaciones (VIN, matrícula, fechas), foto privada, motor documentado, motor sin documentar, avisos, historial, documentos, aislamiento entre usuarios, borrado con confirmación y el OCR de la ficha.
- **Límite declarado**: la base documentada cubre 12 motores; el OCR puede equivocarse y siempre se pide revisar los datos; el asistente usa el historial guardado y no sustituye una diagnosis de taller.

## Reconocer testigos: MOD 7, primer bloque (30/10/2026)

- **Qué se añadió**: pestaña **Testigos**, segunda del menú (justo después de Mi garaje). Permite fotografiar o subir una imagen del cuadro, elegir el color del aviso, describirlo o buscar directamente en el catálogo. Cada ficha incluye las doce secciones del MOD 7: nombre, símbolo, significado, función del sistema, causas, averías relacionadas, síntomas, comprobaciones, soluciones, riesgo de circular, gravedad y fuentes.
- **Datos** (`data/warning-lights.json`): **18 testigos** del primer bloque, con los cinco colores (rojo, ámbar, verde, azul, blanco) y las cuatro gravedades (crítico, grave, precaución, informativo). Seis fuentes compartidas: ISO 2575:2021, Reglamento UNECE 121, manuales de Volkswagen y SEAT, Bosch y HELLA. Los símbolos son **pictogramas esquemáticos** dibujados por la web y se declaran como tales: no se presenta ninguna imagen como fotografía real de un cuadro.
- **API** (`src/routes/testigos.js`, `src/lib/warning_lights.js`): `GET /api/testigos` con filtros de texto, color y gravedad; `GET /api/testigos/:id`; `GET /api/testigos/stats`; `POST /api/testigos/analizar` con límite de 40 análisis cada 10 minutos por IP y validación del archivo (JPG, PNG o WebP, máximo 4 MB tras decodificar).
- **IA con visión** (`src/lib/ai_provider.js`): nueva `callAIVision` para proveedores compatibles con OpenAI y para Gemini, con comprobación de que el modelo acepte imágenes antes de enviar nada. La respuesta se pide en JSON y **solo se aceptan ids del catálogo**; por debajo del 55 % de coincidencia se declara que no hay identificación segura.
- **Sin proveedor con visión**: hoy la clave configurada es de un modelo de texto, así que el módulo no inventa una identificación. Filtra los candidatos por color y descripción, explica que no hay visión disponible y pide marca, modelo o una foto mejor. Ninguna ficha se genera sobre la marcha.
- **Interfaz** (`public/index.html`, `public/js/testigos.js`, `public/css/reforma.css`): foto con cámara del móvil o archivo, reducción a 1280 px en el navegador antes de enviarla, vista previa, selector de color, pista de texto, resultado con candidatos y ficha completa con fuentes. Buscador con retardo y filtro por gravedad.
- **Verificado**: `node --test tests/testigos.test.mjs` **7/7** y `tests/garaje.test.mjs` **7/7**. En Firefox real, una sola instancia por pasada y perfil borrado al terminar: **18 tarjetas**, ficha con **10 bloques** y **3 enlaces a fuentes**, filtro rojo con **8 tarjetas**, foto preparada y analizada con **6 candidatos** y sin identificación inventada, **0 errores de consola** y **0 desbordamiento horizontal** a 1366 px y a 390 px (iframe de 390).
- **Portada**: la pestaña **Mi garaje pasa a ser la primera** del menú y más grande (14,5 px frente a 8,8 px de Inicio). El nombre de la web sube al héroe y queda **alineado con la parte alta de la foto del coche** (18 px de diferencia medida), con el recuadro de Mi garaje **16 px debajo**: incluye «Tu primer coche, gratis», la opción **Foto de la ficha técnica** (lleva la imagen al OCR del garaje) y el acceso manual. Comprobado que la foto deja el aviso «Tu ficha está lista…» en el acceso a Mi garaje.
- **Copia de seguridad**: `backups/mod7-testigos-20261030.tar.gz`, con los archivos tocados y este informe.
- **Pendiente declarado**: la identificación automática depende de un proveedor con visión (no configurado ahora); el catálogo tiene 18 fichas y debe crecer por marca, modelo y generación; falta probar la cámara real en un teléfono físico (se ha probado la subida de archivo y el diseño a 390 px); las fichas marcan sus límites y ninguna sustituye al manual del vehículo.

## Fiabilidad: segundo bloque de ampliación, 4 motores (04/11/2026)

- **Objetivo**: seguir hacia los 30 motores cerrando bloques completos. Este bloque añade **4 motores y 19 averías**.
- **Criterio de selección**: se descartaron el K9K, el N47 y el 1.0 EcoBoost porque **ya estaban** en la base con bloques anteriores. No se duplican familias: cada bloque entra con motores que faltaban de verdad.
- **Nuevos motores**:
  - `mercedes-om642-30-cdi` — V6 3.0 CDI (2005–2018). 4 averías: juntas del enfriador de aceite en el valle, palomillas de admisión, sello del turbo al pedestal y DPF/EGR.
  - `fiat-13-multijet` — 1.3 Multijet / MultiJet II (2003–2020). 5 averías: cadena de distribución, asientos de inyector, turbo de geometría variable, inyectores y EGR/DPF.
  - `psa-ep6-16-thp` — EP6 Prince 1.6 THP (2006–2018). 5 averías: cadena y pérdida de sincronización, bomba de alta presión, carbonilla, consumo de aceite y turbo.
  - `hyundai-kia-16-crdi` — 1.6 CRDi U2 y Smartstream (2007–2022). 5 averías: cadena del D4FB, pasador de la polea del cigüeñal del D4FE, correa de bomba de aceite bañada en aceite, inyectores y DPF/EGR.
- **Cobertura resultante**: **16 motores**, **69 averías**, **24 marcas** citadas y **81 fuentes únicas** (todas https). Por estado: 67 «incidencia reportada» y 2 «confirmada».
- **Estados honestos**: el enfriador de EGR del N47 no se ha duplicado, pero el OM642 se queda en 4 averías porque no había una quinta con documentación suficiente. El 1.6 CRDi se marca con `confidence` **media-baja**: el fallo del pasador de la polea está documentado por un taller y casos repetidos, pero no consta campaña europea pública.
- **Verificado**: `/api/reliability` devuelve `stats.engines = 16` y `stats.issues = 69`; las 16 fichas de detalle responden 200; `brand=Fiat` (1), `q=cadena` (9), `year=2010` (11), `status=confirmada` (2 motores) y el buscador universal devuelve resultados de fiabilidad. `npm test`: **111/111**.
- **Sin cambios de interfaz**: la vista de Fiabilidad ya pintaba las fichas desde la API, así que no hizo falta tocar HTML ni CSS; los datos se leen del servidor.
- **Límites declarados**: quedan **14 motores** para llegar a 30. Los costes son orientativos para taller independiente en España y varían por modelo y mercado. No hay estadística oficial de tasa de fallo en ningún caso.

## Visión real para Reconocer testigos (04/11/2026)

- **Qué cambió**: el proveedor de visión es ahora **independiente del de texto**. Se elige con `AI_VISION_PROVIDER` y `AI_VISION_MODEL`, así que se puede chatear con un modelo rápido y leer imágenes con otro multimodal. Sin variables, se usa el proveedor de texto si acepta imágenes y, si no, se busca uno con visión en este orden: Gemini, OpenAI, OpenRouter, Mistral, Groq, compatible.
- **Código** (`src/lib/ai_provider.js`): nueva `resolveVisionProvider()`, y `aiVisionStatus()` distingue `no_key` de `no_vision` — antes cualquier proveedor de texto se reportaba como «sin visión» aunque hubiera uno multimodal disponible.
- **Configuración**: la clave de Gemini de `.env` funciona. Se fijó `AI_VISION_PROVIDER=gemini` y `AI_VISION_MODEL=gemini-3.5-flash-lite`. No se usó `gemini-3.8-flash` porque devolvía **503 (servicio saturado)** en todas las pruebas, y `gemini-2.5-flash` ya responde **404: no disponible para cuentas nuevas**. `gemini-3.5-flash-lite` respondió 200 con imagen. Las variables nuevas están documentadas en `.env.example`.
- **Fallo corregido**: la llamada de visión enviaba `thinkingConfig: { thinkingBudget: 0 }`, que ese modelo rechaza con **400 INVALID_ARGUMENT**. Se omite en visión; el camino de texto no se ha tocado.
- **Verificado con una foto real**: cuadro de un Fiat 500 Abarth (Wikimedia Commons, dominio público, 960×765) enviado a `POST /api/testigos/analizar` con color rojo y pista de vehículo. Resultado **HTTP 200**, `identified: true`, candidatos **`cinturon`** y **`puerta-abierta`**, con texto para el conductor y texto técnico generados a partir de la foto. Primera llamada 7,3 s; siguientes por debajo de 1 s.
- **Lo que no cambia**: siguen sin inventarse fichas. El modelo solo puede devolver **ids del catálogo** (18 testigos) y por debajo del umbral de coincidencia se declara que no hay identificación segura. Si el proveedor falla, el módulo filtra candidatos por color y descripción y lo explica.
- **Pruebas**: `npm test` **111/111**, incluidos `tests/testigos.test.mjs` y `tests/garaje.test.mjs`. `node --check src/lib/ai_provider.js` correcto.
- **Límites declarados**: el catálogo sigue teniendo 18 testigos y debe crecer por marca, modelo y generación; la identificación es orientativa y pide confirmar el símbolo; los modelos flash pueden volver a dar 503 por saturación del servicio; falta probar la cámara real en un teléfono físico.

## Testigos: bloque 2, 12 fichas nuevas (04/11/2026)

Catálogo de testigos ampliado de **18 a 30 fichas**, todas con las 21 secciones, gravedad y fuentes.

- **Lubricación y combustible**: `nivel-aceite` (amarillo), `agua-combustible` (amarillo, separador diésel), `adblue` (amarillo, SCR/ISO 22241).
- **Transmisión**: `caja-automatica` (ámbar, modo de emergencia), `traccion-4x4` (Haldex/AWD).
- **Frenos**: `freno-estacionamiento` (rojo, EPB eléctrico).
- **ADAS**: `crucero-adaptativo`, `colision-frontal`, `salida-carril`, `punto-ciego`.
- **Alta tensión**: `bateria-alta-tension` (rojo, riesgo eléctrico), `cable-carga` (fallo de carga EV/PHEV).

Nuevos recuentos: rojo 10, amarillo 18, azul 1, verde 1 · crítico 4, grave 6, precaución 17, informativo 3.
Verificado: `npm test` 111/111, stats de la API `lights: 30`, detalle 200 en las fichas nuevas, filtro `color=amarillo` → 18.

## Testigos: catálogo completo, 101 fichas (04/11/2026)

Ampliado de 18 a **101 testigos** en siete bloques, todos con las 21 secciones y fuentes normativas o de fabricante.

- **Bloque 1 (18)**: universales — aceite, refrigerante, batería, frenos, ABS, airbag, MIL, calentadores, FAP, neumáticos, ESP, dirección, cinturón, puertas, largas, intermitentes, inmovilizador, Service.
- **Bloque 2 (12)**: nivel de aceite, AdBlue, agua en combustible, caja automática, freno eléctrico EPB, crucero adaptativo, colisión frontal, salida de carril, punto ciego, batería de alta tensión, cable de carga, tracción total.
- **Bloque 3 (15)**: posición, cruce, antinieblas, luz de freno, avería de iluminación, intermitente de remolque, limpiaparabrisas, filtro de aire, bujías, Start-Stop, Eco, control de crucero, limitador, Auto Hold.
- **Bloque 4 (15)**: ESP desconectado, HDC, suspensión neumática, bloqueos, reductora, temperatura de caja, embrague, nivel de refrigerante, tapón de combustible, reserva, filtro de combustible, Run-Flat, fallo TPMS, desgaste de frenos, líquido de frenos.
- **Bloque 5 (15)**: modo EV, sistema híbrido, frenada regenerativa, convertidor DC/DC, refrigeración del pack, airbag desactivado, cinturones traseros, eCall, aparcamiento, cámara trasera, alarma, avería electrónica, señales de tráfico, eje trasero direccional, modos de terreno.
- **Bloque 6 (15)**: aditivo del FAP, regeneración del FAP, catalizador, sonda lambda, turbo, EGR, vida del aceite, pila del mando, riesgo de hielo, preacondicionamiento, autonomía eléctrica, potencia limitada por temperatura, faros adaptativos, marcha atrás, monitores OBD.
- **Bloque 7 (11)**: fatiga, tráfico cruzado trasero, aviso de apertura de puertas, asistente de atasco, manos en el volante, estabilización y modo remolque, control de balanceo, cámara 360, visión nocturna, frenada trasera automática.

Recuento final: rojo 16, amarillo 67, azul 2, verde 15, blanco 1 · crítico 4, grave 23, precaución 54, informativo 20.
Verificado: `npm test` 111/111, stats de la API `lights: 101`, **las 101 fichas responden 200**, búsqueda (`adblue` 1, `turbo` 2, `remolque` 7, `hielo` 3) y filtro `color=rojo` → 16. El aviso del catálogo se actualizó al total real.

## Fiabilidad: bloque 3, cuatro motores (04/11/2026)

La base pasa de **16 a 20 motores y de 69 a 87 averías**, con fuentes consultadas para cada ficha.

| Motor | Familia | Años | Averías |
|---|---|---|---|
| `honda-l15b7-15-vtec-turbo` | L15B7 / L15BA (1.5 VTEC Turbo) | 2015– | 5 |
| `psa-dv5-15-bluehdi` | DV5R (1.5 BlueHDi) | 2017– | 5 |
| `toyota-2zr-fxe-18-hybrid` | 2ZR-FXE (1.8 híbrido) | 2009– | 4 |
| `bmw-n20-20-turbo` | N20 / N26 (2.0 TwinPower Turbo) | 2011–2017 | 4 |

Criterio de selección: familias que faltaban y que no repiten las ya documentadas (EA888, EA211, EA189, PureTech, EcoBoost, K9K, H5Ft, K4M, N47, OM651, OM642, DV6, EP6, 1.3 Multijet, 1.6 CRDi). Se añaden por primera vez un híbrido y dos gasolinas turbo de inyección directa modernos.

- **Honda L15**: dilución de aceite por combustible (estado *confirmada*: actualización de software y ampliación de garantía), carbonilla de admisión, wastegate, inyectores y consumo de aceite.
- **PSA DV5**: cadena interna de 7 mm con campaña oficial a 8 mm —el motor usa correa húmeda exterior **y** cadena en la culata, y esa confusión es la causa de diagnósticos caros—, correa húmeda, SCR/AdBlue, FAP y EGR. Incluye la especificación de aceite FPW9.55535/03, requisito de la garantía ampliada.
- **Toyota 2ZR-FXE**: junta de culata de la 3.ª generación del Prius, con las dos explicaciones en disputa (material de la junta y sobrecalentamiento por bomba de agua frente a la teoría de la carbonilla del EGR), bomba de agua eléctrica, EGR y consumo de aceite.
- **BMW N20**: guías y tensor de cadena, cadena de la bomba de aceite y aspiración obstruida por restos, solenoides VANOS que imitan la avería de cadena y fugas por la tapa de válvulas.

Ninguna ficha inventa una quinta avería para cuadrar el bloque: el 2ZR-FXE y el N20 se quedan en cuatro. Los importes son orientativos para talleres españoles y el estado distingue *confirmada* (campaña o reconocimiento) de *reportada*.

Verificado: `npm test` 111/111 · API `engines: 20 / issues: 87` · las cuatro fichas responden 200 · `brand=Honda` → 1, `q=cadena` → 12, `q=adblue` → 1 · validación de esquema y duplicados en el script de fusión, con todas las fuentes en https.

## Revisión en navegador del catálogo de testigos (04/11/2026)

Comprobado en Firefox real con el catálogo de 101 fichas:

- **1360×1000**: 101 tarjetas pintadas, contador de cabecera 101, filtro rojo → 16, gravedad *informativo* → 20, búsqueda `adblue` → 1, detalle abierto con 10 bloques y 4 fuentes, sin desbordamiento horizontal (1354/1360) y 0 errores de consola.
- **390×844** (iframe de ancho real, porque Firefox headless no baja de 500 px de ventana): 101 tarjetas, filtro rojo → 16, búsqueda `remolque` → 7, detalle con 3 fuentes, sin desbordamiento (384/384) y 0 errores.

## Sala de máquinas: banco de instrumentos y osciloscopio (05/11/2026)

Inicio queda limpio: fuera el HUD de telemetría, el panel de donut/barras y la antigua tira de tres relojes con su gráfica. Toda esa instrumentación vive ahora en la pestaña **Sala de máquinas**.

- **25 relojes** en cinco grupos (motor, temperaturas, presiones, mezcla y encendido, eléctrico y combustible), con el mismo componente `gauge-ring` del resto de la web y filtro por grupo.
- **Osciloscopio** de doble canal (inyector, primario de encendido, sonda lambda, MAP y cigüeñal), con base de tiempo 1–50 ms/div, amplitud 0,5–10 V/div, disparo y lectura de régimen/periodo. La onda se reconstruye a partir del régimen y la carga de la ECU.
- **Cuatro gráficas en tiempo real** (régimen y velocidad, temperaturas, presiones, mezcla y eléctrico), con histórico de 60 muestras y ventana temporal.
- Consola propia: arrancar simulador, pausar/reanudar, detener y borrar registro, reutilizando el gestor ELM327. El origen (simulación o ELM327) se muestra siempre.

Comprobado en Firefox real a 1360 y 390 px: 25/25 relojes con dato, 15/15 series con puntos, osciloscopio pintando ambos canales (píxeles de señal detectados), controles de canal/base/amplitud, filtros, pausa (muestras estables), reanudar, parada (todo a `--` y osciloscopio vacío), sin errores de consola ni desbordamiento horizontal.

## Sala de máquinas: segunda tanda de relojes (05/11/2026)

De 25 a **39 relojes**, con ocho grupos y catorce magnitudes que antes no estaban en la web:

- **Motor**: demanda del conductor, par de referencia y avance de inyección (PID 0161, 0164, 015D).
- **Temperaturas**: aire tras el intercooler (0177).
- **Combustible**: presión de combustible (010A), rail absoluto (0159), vapor del depósito con signo (0132) y porcentaje de etanol (0152).
- **Escape y turbo**: temperatura de gases de escape (0178) y régimen del turbocompresor (0174).
- **Eléctrico**: vida de la batería de alta tensión (015B).
- **Uso y mantenimiento**: horas de motor (017F), distancia desde el borrado (0131) y distancia con testigo encendido (0121).

Los PID se añadieron también al simulador virtual, para que los relojes tengan dato sin hardware, y la gráfica nueva es de escape y admisión (EGT, intercooler y régimen de turbo). Comprobado en Firefox a 1360 y 390 px: 39/39 relojes con valor, 18/18 series, filtro de temperaturas 7, sin errores ni desbordamiento; valores coherentes (EGT 442 °C, turbo 55.788 rpm, EVAP −104 Pa, 412 km desde el borrado).

## Cierre: luz y multimedia, pagos y Sala real (05/11/2026)

- **Alcance**: se termina el trabajo que había quedado a medias (nuevos productos, precios, imágenes, pasarela de pago y conexión real de la Sala). No se tocan los manuales ni los pines de centralitas.
- **Luz y multimedia**: la pestaña pasa a **7 familias y 33 fichas verificadas**. Se añaden `luz-trabajo` (3 linternas de taller con imán y gancho) y `camaras` (3 endoscopios/boroscopios), todas con foto local y enlace de vendedor comprobados. Se mantienen las guías honestas de xenon y pantallas sin fichas inventadas.
- **Precios**: la API entrega `price` y `listingPrice`; la ficha usa el precio de venta si existe y, si no, muestra el **precio observado** con su etiqueta. Queda una ficha Philips sin importe en el catálogo de origen y se muestra como «Consultar precio», sin inventarlo.
- **Afiliación corregida**: `AFFILIATE_TAG_AMAZON` se lee en cada petición, no al importar el módulo. Antes `dotenv.config()` se ejecutaba después de evaluar los imports y la etiqueta del `.env` se perdía. Igual para `REPORT_PRICE_CENTS`, `REPORT_CURRENCY`, `REPORT_PRODUCT_NAME` y `REPORT_ORDERS_PATH`.
- **Pagos Stripe**: Checkout con pedido único, token de descarga, verificación de sesión, **webhook firmado** (`checkout.session.completed` y `async_payment_succeeded`), confirmación al volver del pago, límite de 12 intentos de compra cada 10 minutos por IP y cabeceras `no-store`/`noindex` en el informe. `data/orders.json` (email y datos del informe) queda fuera de Git.
- **Sala de máquinas**: «Conectar adaptador» ya no arranca el simulador. Usa Web Serial o Web Bluetooth según la configuración de la pestaña OBD y, si el navegador no puede, lo dice y ofrece el modo demostración. «Modo demostración» es el botón que inicia el simulador, siempre identificado como simulación.
- **Pruebas**: nuevas `tests/lighting.test.mjs` (familias, 33 fichas, fotos servidas, precios y etiqueta de afiliación), `tests/payments.test.mjs` (estado sin clave, checkout 503, webhook sin secreto, informe pagado/pendiente y pedidos temporales) y `tests/payments-webhook.test.mjs` (firma inválida, evento firmado que desbloquea el informe e idempotencia). `npm test`: **123/123**.
- **Navegador real (Firefox)**: 18 pestañas a 1360×1000 y 390×844. Luz con **33 tarjetas**, **7 familias**, **32/33 precios con importe**, **0 fotos rotas** y **0 fichas pendientes**. Sala: el botón de adaptador responde con el aviso correcto y la demostración pinta **39 instrumentos**. En toda la web: **0 imágenes rotas, 0 enlaces vacíos, 0 errores de consola** y **0 desbordamiento** (1354/1354 y 384/384). Las rutas `/api/lighting-media` y `/api/payments/status` responden 200.
- **Pendiente declarado**: para cobrar de verdad hay que añadir `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` al `.env` y reiniciar. Sin claves, la compra queda desactivada con aviso y el resto de la web funciona igual. La ficha Philips sin precio de catálogo se queda en «Consultar precio».
- **Caché del frontend**: `app.js?v=20261105d`, `lighting.js?v=20261105b`, `testigos.js?v=20261105a`.
- **Copia de seguridad**: `backups/cierre-luz-pagos-20261105.tar.gz` con los archivos tocados y este informe.

## Accesorios dentro de Tuning: pantallas, luces y audio (05/11/2026)

- **Navegación**: eliminada la pestaña **Recambios** (`tuning-productos`) y su vista. El catálogo completo pasa a **Tuning > Accesorios**, con ancla `#tuningAccesorios`; los accesos rápidos de las guías siguen abriendo la categoría correspondiente dentro de Tuning.
- **Catálogo**: de **168 a 236 productos** y de 17 a **21 categorías**. Se añaden `pantallas-carplay`, `iluminacion-ambiente`, `audio-video` e `interior-accesorios` al principio del listado. Los 168 productos anteriores se conservan.
- **Nuevos productos**: **68 fichas reales de Amazon** con precio, foto local y enlace directo:
  - **30 pantallas** CarPlay/Android: 10 de 7", 10 de 9" y 10 de 10"+; **38,99–209,99 €**, todas ≤350 € y ordenadas de barata a cara.
  - **20 de iluminación**: tiras RGB, neón, fibra óptica, proyectores y luces USB; **6,29–41,29 €**.
  - **10 de audio/CarPlay/cámaras**: altavoces, subwoofer, dashcam y adaptadores inalámbricos; **34,90–119,99 €**.
  - **8 de interior**: volantes, pedales, pomos y soportes; **11,99–36,49 €**.
- **Precios**: recuperados los **30 productos que estaban en «Consultar»**; ahora **236/236 tienen precio real** y no queda ninguno pendiente. Precios consultados el 05/11/2026.
- **Imágenes**: **68 WEBP nuevos** en `public/img/productos/amz-{asin}.webp`, descargados de la ficha del vendedor y normalizados a 900 px de lado máximo y calidad 82. Todas las fichas del catálogo apuntan a una imagen local existente.
- **Afiliación**: `tagItem()` ahora aplica `AFFILIATE_TAG_AMAZON` tanto a `affiliateUrl` como a `links[].url`; el detalle `/api/tuning-products/:id` también devuelve el enlace etiquetado. Sin etiqueta configurada, los enlaces siguen siendo directos.
- **Enlaces**: verificados **376 enlaces únicos**: **236 de Amazon responden 200**, 140 de eBay quedan *bloqueados* (403 por robots, no rotos) y **0 rotos**. Los 68 productos nuevos y los 30 precios recuperados respondieron 200 en su ficha.
- **Pruebas**: `npm test` **124/124**. Se actualizan los tests del catálogo (236 items, 21 categorías, 30 pantallas, precios ≤350 €, cero «Consultar») y se añade la comprobación de afiliación de `links[]` en el catálogo y en el detalle.
- **Navegador real (Firefox)**:
  - **1360×1000**: 236 tarjetas, 236/236 con precio, 30 pantallas filtradas y ordenadas, 0 imágenes rotas, sin desbordamiento (1354/1354), 0 enlaces vacíos, 0 IDs duplicados y 0 errores de consola.
  - **390×844**: 236 tarjetas, 30 pantallas, sin desbordamiento (384/384), 0 imágenes rotas y 0 errores de consola. El ancla de Accesorios queda a 84 px de la cabecera tras el desplazamiento.
- **Caché del frontend**: `reforma.css?v=20261105a`, `app.js?v=20261105e`.
- **Copia de seguridad**: `backups/pre-accesorios-20261105.tar.gz` con datos, HTML, JS, CSS y API previos al cambio, más su `.sha256`.
- **Pendiente declarado**: las piezas que citan un modelo concreto (por ejemplo, pantallas para Peugeot o Ford) muestran el aviso de comprobar modelo, año y versión; no se ha inventado una tabla de compatibilidades. No se ha hecho commit.

## Ajuste de navegación: Accesorios Tuning como pestaña (05/11/2026)

- El catálogo ya no aparece como bloque inferior dentro de Tuning. Ahora Tuning tiene dos **pestañas superiores**: **Guías de preparación** y **Accesorios Tuning**.
- Al entrar en Tuning se abre **Guías de preparación**; los accesos rápidos de las guías siguen abriendo directamente **Accesorios Tuning** con la categoría elegida.
- El catálogo se carga al activar la pestaña (caché en memoria después). Se mantienen buscador, filtro por coche, categorías, precios, fotos locales y legal.
- Comprobado en Firefox a **1360×1000** y **390×844**: pestañas correctas, 236 tarjetas al activar Accesorios, 30 pantallas ordenadas, 0 imágenes rotas, 0 errores de consola y sin desbordamiento (1354/1354 y 384/384).
- `npm test`: **124/124**. Caché del frontend: `reforma.css?v=20261105b`, `app.js?v=20261105f`.

## Neumáticos y llantas (2026-11-06)

Módulo nuevo `Neumáticos` en la navegación, entre Luz y multimedia y Productos.

- Buscador por medida (ancho/perfil/llanta) y temporada contra `/api/tyres`.
- Calculadora de equivalencias con diámetro exterior, ±3 %, anchura máxima +30 mm,
  garganta orientativa y avisos por fila (`/api/tyres/equivalents`).
- Comparador de hasta tres fichas con etiqueta UE, índices, precio y tienda.
- Comprobador de llantas por PCD, buje, ET y garganta (`POST /api/wheels/fit`).
- Catálogo real: 48 neumáticos en 8 medidas, ASIN y foto descargada a
  `public/img/neumaticos/`; 13 con etiqueta europea publicada por el vendedor.
- Lógica en `src/lib/tyres.js`, vista en `public/js/tyres.js`, datos en
  `data/tyres.json`. Tests en `tests/tyres.test.mjs`.
