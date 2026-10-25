# PROGRESO DE LA MISIÓN FINAL

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
