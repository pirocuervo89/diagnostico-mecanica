# Informe de remodelación — Diagnóstico y Mecánica

Fecha: 2026-10-23  
Proyecto: `/home/selupiro/diagnostico-mecanica`  
Prompt ejecutado: `/home/selupiro/Escritorio/remodelacion`  
Servidor de comprobación: `http://localhost:3000`  
PID actual: `229330`

## Veredicto

La aplicación sigue funcionando y la remodelación aporta tres piezas nuevas verificables: portada con vehículo 3D interactivo y fallback, inicio de diagnóstico mediante ficha técnica/foto con OCR local, y sección de compra con 10 fichas documentadas. También se mejoró la identificación de versión en el chat y se corrigieron defectos de responsive y de enlace de motor.

La entrega **no se presenta como completa**: el requisito de añadir 200 averías nuevas documentadas por marca/modelo/motor/generación no se ha cumplido. No se han fabricado registros para aparentar cobertura. Las fichas actuales contienen **10 problemas conocidos** y **61 puntos de inspección** en total; los 454 síntomas existentes son genéricos y no se han duplicado como si fueran averías específicas de motor.

## Estado inicial (al recibir el prompt)

El prompt se recibió el 2026-10-23 a las 22:24 sobre un proyecto ya funcional y con cambios sin commit:

- 9.201 códigos DTC.
- 454 síntomas (250 curados), 9 categorías, 289 con DTC y 165 sin DTC.
- 500 productos con foto local y enlace de Amazon.es.
- 10 fichas de vehículo, 6 guías de tuning y 10 dossiers de biblioteca.
- 193 tutoriales verificados en fases anteriores.
- 75 pruebas automatizadas al recibir el prompt; tras añadir las de esta fase, **79/79**.
- Servidor Express en `:3000`, SPA vanilla, SQLite para foro/tutoriales y documentación de fases previas.
- Árbol Git con cambios pendientes; no se revirtió ni se borró trabajo anterior.

## 1. Trabajo realizado

### 1.1 Portada y vehículo 3D

- Nuevo `public/js/hero3d.js` con Three.js local en `public/vendor/three/`; no depende de CDN.
- Vehículo procedural original, presentado como **representación estilizada** y no como CAD ni réplica oficial del Golf R 7.5.
- Iluminación, entorno, cámara con órbita/zoom, sombra, suelo técnico, 12 hotspots y etiquetas de sistema.
- Fallback accesible si WebGL no está disponible, con mensaje y enlaces alternativos.
- Corregido el fallback que se mostraba superpuesto aunque estuviera oculto:
  `.golf3d-fallback[hidden] { display: none !important; }`.
- Portada responsive: en escritorio el vehículo ocupa un encuadre controlado; por debajo de 920 px el bloque pasa a flujo vertical, el coche va debajo del texto y el HUD se oculta para evitar solapes.
- Verificado en 1440, 768 y 390 px sin scroll horizontal y sin errores de página.
- Los hotspots son información genérica de sistemas; no representan compatibilidad verificada por vehículo.

### 1.2 Diagnóstico desde ficha técnica o fotografía

- Nueva sección de inicio de diagnóstico en la portada, antes del selector de vehículo.
- Formatos: JPG, PNG, WebP y PDF; límite de 12 MB.
- Entrada por selector de archivo, arrastre, cámara del dispositivo o formulario manual.
- Backend `src/lib/document_scan.js`:
  - OCR local con Tesseract y datos `spa`/`eng`.
  - PDF con capa de texto mediante `pdf-parse`.
  - PDF escaneado mediante render de página + OCR local.
  - Extracción de marca, modelo, generación, año, VIN, código de motor, cilindrada, potencia, combustible, cambio y norma de emisiones.
  - Vínculo con las 10 fichas de vehículo cuando hay coincidencia suficiente.
- Las imágenes se procesan en memoria y **no se almacenan**; el VIN no se persiste ni se publica.
- Revisión obligatoria antes de aplicar: todos los campos son editables y los vacíos quedan como desconocidos.
- Al continuar, se aplica el vehículo al diagnóstico, se rellena el año y se abre la vista `diagnostico`.
- Validación de VIN: 17 caracteres y sin I, O ni Q. Si el OCR pierde un carácter, no se fuerza una coincidencia falsa.
- Endpoints nuevos:
  - `GET /api/vehicle/scan/status`
  - `POST /api/vehicle/scan`
- El escáner no identifica un coche por una foto exterior; solo lee documentos o datos escritos. La interfaz lo advierte.

### 1.3 Compra de vehículos

- Nueva vista `#view-compra` y archivo `public/js/buying.js`.
- Acceso desde una tarjeta de la portada, el footer y la cabecera de vehículos.
- 10 fichas reales, 8 marcas y 10 versiones ya documentadas.
- Cada tarjeta muestra versión, años, especificaciones, riesgo editorial, problemas conocidos, comprobaciones previas, fuentes y acciones.
- Filtros por texto, marca y recomendación:
  - Recomendable: 1 ficha.
  - Recomendable con condiciones: 7 fichas.
  - Compra con precaución: 2 fichas.
- “Ver ficha completa” abre la ficha del vehículo correspondiente.
- “Diagnosticar esta versión” aplica el vehículo y abre el diagnóstico.
- Aviso visible: no es un porcentaje de averías ni un ranking estadístico de fiabilidad.
- No se añadieron precios, porcentajes de fallo, costes de reparación ni rankings sin fuente.

### 1.4 Chat contextual

- `/api/chat` identifica la versión si el usuario no envía `vehicleId`.
- La puntuación combina marca, modelo, combustible, potencia, cilindrada y texto de la versión.
- Casos verificados:
  - `2.0 TDI 150 CV` → Volkswagen Golf VII 2.0 TDI 150.
  - `2.0 TSI 310 CV` → Volkswagen Golf VII R 7.5.
  - `2.0 TSI` sin potencia → no fuerza una versión ambigua.
  - `320d 190 CV` → BMW 320d F30.
- Cuando identifica el vehículo, incorpora problemas conocidos, guía de compra y cobertura/pendientes de biblioteca al contexto.
- Gemini continúa con cuota agotada o timeout; el motor local sigue respondiendo y no se oculta el fallo.

### 1.5 Datos y módulos conservados

- 9.201 códigos DTC.
- 454 síntomas revisados, 9 categorías, 289 con DTC, 165 sin DTC, 250 curados.
- 500 productos con ID, nombre, ASIN, foto local y enlace de Amazon.es marcado como verificado en la auditoría previa.
- 10 fichas de vehículo, 6 guías de tuning, 10 dossiers de biblioteca.
- Foro, tutoriales, OBD simulado, informe y buscador universal se mantienen operativos.

## 2. Verificaciones ejecutadas

### Pruebas automatizadas

- `npm test`: **79/79 correctas**, 0 fallos, 0 canceladas.
- `npm run symptoms:check`: 454 registros, 9 categorías, 250 curados, 289 con DTC, 165 sin DTC, **0 errores**.
- `node scripts/verify-products.mjs`: **500/500** activos, IDs/nombres/ASIN únicos, 500 imágenes locales presentes y 500 enlaces con formato Amazon/estado verificado en los datos, **0 errores estructurales**. El script no hace comprobación HTTP en vivo.
- Comprobación de sintaxis de `server.js`, rutas, librerías nuevas y frontend: sin errores.

### Navegador

- QA global de 12 vistas en 1440, 768 y 390 px:
  - Solo la vista activa visible.
  - Sin desbordamiento horizontal.
  - Sin errores `pageerror`.
- Escáner móvil 390 px:
  - PDF con texto procesado como `pdf_text`.
  - Marca, modelo y año extraídos y editables.
  - Ficha aplicada al diagnóstico y año trasladado al formulario.
  - Sin overflow.
- Escáner escritorio 1440 px:
  - Imagen de ficha procesada con OCR local.
  - Volkswagen Golf 2018, confianza `MEDIA-ALTA · 71%`.
  - Sin overflow.
- Validación manual: VIN incorrecto rechazado con mensaje explícito.
- Compra:
  - 10 tarjetas iniciales.
  - Búsqueda “Golf” → 3 tarjetas.
  - Filtros de recomendación → 1 / 7 / 2.
  - “Diagnosticar esta versión” aplica el vehículo y abre diagnóstico.
  - Sin overflow en 390 px.
- Fallback 3D sin WebGL:
  - Visible en escritorio y móvil.
  - Indicador de carga oculto.
  - Sin errores de página.

### Rendimiento observado del escáner

- Imagen: aproximadamente 1,04 s en la prueba de referencia.
- PDF escaneado: aproximadamente 3,38 s.
- PDF con texto: respuesta rápida por extracción directa.
- Son tiempos de esta máquina y estos archivos; no una garantía universal.

## 3. Defectos corregidos

| Defecto | Corrección |
|---|---|
| Fallback 3D visible aunque estuviera oculto | Regla `[hidden]` con `display: none !important` |
| Vehículo móvil fuera del flujo y con solapes | Hero vertical y ocultación del HUD en ≤920 px |
| Coche demasiado grande en escritorio | Encuadre reducido y reposicionado |
| Enlace erróneo a una versión por motorización | Puntuación por combustible, potencia y versión |
| Código de motor falso `IZACI` | Parser corregido para no leer la etiqueta “Motorización” |
| Duplicado visual en el filtro de recomendación | Etiquetas distintas para “Recomendable” y “Recomendable con condiciones” |
| Capturas headless con texto corrupto | QA con `--disable-lcd-text --font-render-hinting=none`; validación adicional por DOM |
| Error aislado `null.trim` | No reproducido en las QA finales; sin stack reproducible pendiente |

## 4. Requisitos no completados

### 4.1 Lote de 200 averías nuevas por motor

**Averías nuevas verificadas en esta fase: 0.** No completado.

El prompt pide 200 averías nuevas documentadas por marca, modelo, generación, año y motor.

Estado real:

- 10 problemas conocidos documentados en total, todos heredados de las fichas previas.
- 61 puntos de inspección.
- 454 síntomas genéricos que no acreditan compatibilidad por motor.
- 13 entradas de fuente en las fichas de vehículo (11 URL únicas).

Motivo: no existe en el proyecto una base oficial o licenciada de averías por motor, y no se han encontrado fuentes suficientes para 200 registros con nivel de detalle verificable. Duplicar síntomas o atribuir fallos genéricos a motores concretos habría creado datos falsos.

Para completarlo hacen falta, como mínimo:

- Fuentes técnicas verificables por versión y motor.
- Revisión de un técnico o especialista.
- Estructura de registro con síntoma, causas, comprobaciones, solución, coste orientativo, fuente y fecha.
- Separación explícita entre avería documentada, patrón genérico e hipótesis.

### 4.2 Cobertura de marcas, modelos y motores

**Vehículos nuevos incorporados en esta fase: 0.** Se mantienen las 10 fichas existentes, sin ampliar la cobertura 2000–2026 solicitada.

| Marca | Modelo | Versión | Generación | Años | Motor declarado |
|---|---|---|---|---|---|
| Volkswagen | Golf | R 2.0 TSI 4MOTION | Mk7 facelift 7.5 | 2017–2020 | EA888 Gen3; código exacto no verificado |
| Volkswagen | Golf | GTI Performance 2.0 TSI | Mk7 facelift 7.5 | 2017–2019 | EA888 Gen3; código exacto no verificado |
| Volkswagen | Golf | 2.0 TDI 150 | Mk7 facelift 7.5 | 2017–2020 | EA288; código exacto no verificado |
| BMW | Serie 3 | 320d | F30 | 2012–2019 | N47D20 / B47D20 según año |
| Mercedes-Benz | Clase C | C 220 d | W205 | 2014–2021 | OM651 / OM654 según año |
| Renault | Clio | 1.5 dCi 90 | Clio IV | 2012–2019 | K9K; código exacto no verificado |
| Ford | Focus | 1.5 TDCi 120 | Mk3 facelift | 2014–2018 | 1.5 TDCi; código exacto no verificado |
| Audi | A3 | 2.0 TDI 150 | 8V | 2012–2020 | EA288; código exacto no verificado |
| SEAT | León | 2.0 TDI 150 | Mk3 5F | 2012–2020 | EA288; código exacto no verificado |
| Toyota | Corolla | 1.8 Hybrid 122 | E210 | 2019–2022 | 2ZR-FXE híbrido |

La cobertura es, por tanto, parcial y no representa el mercado europeo 2000–2026.

### 4.3 Documentación técnica, esquemas, fusibles y manuales

- Documentación nueva integrada en esta fase: **0**.
- Esquemas eléctricos disponibles: **0**.
- Cajas de fusibles documentadas: **0**.
- Manuales o procedimientos completos añadidos: **0**.
- Se mantienen 10 dossiers de biblioteca, 7 apartados de cobertura y 8 carencias documentales declaradas.
- No hay manuales oficiales licenciados para esquemas, fusibles, pares de apriete, capacidades, distribución, campañas ni procedimientos completos. No se inventaron valores.

### 4.4 Fuentes consultadas en esta fase

No se consultaron nuevas fuentes externas para fabricar datos. Se reutilizó y validó la estructura de la información existente:

- 11 URL únicas de fichas de vehículo: 4 de Volkswagen (Newsroom/ES) y 7 de Wikipedia.
- 193 tutoriales de YouTube verificados con oEmbed en una fase anterior.
- 500 enlaces de Amazon.es marcados como verificados en la auditoría anterior; hoy no se reejecutó una comprobación HTTP masiva.
- Base local de 9.201 DTC y 454 síntomas; el alcance genérico se mantiene declarado.
- Fuentes independientes de fiabilidad, encuestas de averías y costes de reparación: **no integradas**.

### 4.5 Modelo 3D

El vehículo es una representación procedural estilizada. No es un CAD, no es un modelo oficial y no replica con exactitud el Golf R 7.5. No se encontró un modelo licenciado adecuado.

### 4.6 Otras limitaciones

- Gemini: cuota agotada/timeout; se usa el motor local.
- Sin `YOUTUBE_API_KEY`: no hay búsqueda remota de tutoriales desde administración.
- Sin ELM327 físico: OBD real no validado; solo simulador.
- Sin manuales oficiales: no se inventan valores de par, capacidades, fusibles ni esquemas.
- Sin datos de precios de mercado ni costes de reparación verificados.
- SwiftShader/headless puede generar avisos WebGL y artefactos de captura; validar en navegador normal.
- La foto exterior no identifica el vehículo; el escáner solo lee documentos y datos.

### 4.7 Permisos e integraciones necesarias

- Gemini: clave válida y cuota disponible; actualmente hay timeout/cuota agotada.
- YouTube Data API: `YOUTUBE_API_KEY` para búsqueda remota; no configurada.
- OBD real: hardware ELM327 y navegador con Web Serial/Bluetooth; no disponible en esta sesión.
- Manuales y bases técnicas oficiales: licencia o acceso de fabricante/proveedor; no disponibles.
- Decodificador VIN y datos de mercado: requieren proveedor con permiso; no integrados.
- Precios de Amazon en vivo: requerirían Product Advertising API o web scraping autorizado; no se usan precios.

## 5. Archivos principales

### Nuevos o específicos de esta fase

- `public/js/hero3d.js`
- `public/js/scan.js`
- `public/js/buying.js`
- `src/lib/document_scan.js`
- `public/vendor/three/`
- `data/ocr/`
- `INFORME_REMODELACION_2026-10-23.md`

### Modificados

- `public/index.html`: inicio de diagnóstico, vista de compra, accesos y scripts.
- `public/css/reforma.css`: hero responsive, escáner, compra, correcciones.
- `public/js/app.js`: integración del vehículo, navegación y estados.
- `src/routes/api.js`: `/api/buying`, `/api/vehicle/scan`, `/api/vehicle/scan/status` y chat contextual.
- `server.js`: límites de JSON y montaje necesario.
- `tests/casos.test.mjs`: pruebas de compra, escáner y chat.
- `package.json` y `package-lock.json`: Three.js, Tesseract.js y PDF Parse.

## 6. Backup y entrega

Backup previo a esta fase:

- `backups/pre-remodelacion-20261023-222635.tar.gz`
- SHA256: `052cfb850533dec188f0c3544d3eaeea230f4eb5d61f3995996f2caadde45b0b`
- Restauración comprobada en `/tmp/opencode/restore-check-remodelacion`.

Backup final de esta fase:

- `backups/remodelacion-final-20261023-231200.tar.gz`
- SHA256: se genera en `backups/remodelacion-final-20261023-231200.tar.gz.sha256` después de cerrar el archivo, para evitar una referencia circular dentro del propio backup.
- Integridad gzip y extracción de restauración comprobadas.
- Excluye `.env`, `.git`, `node_modules`, `backups`, las bases SQLite del foro/tutoriales y los adjuntos de usuarios.
- Contiene código, datos JSON, recursos OCR, imágenes, pruebas, informes y documentación.

No se ha creado ningún commit; el árbol de trabajo conserva todos los cambios para revisión.

## 7. Cómo comprobar

```bash
cd /home/selupiro/diagnostico-mecanica
npm test
npm run symptoms:check
node scripts/verify-products.mjs
node server.js
```

Abrir `http://localhost:3000` y comprobar:

1. Portada en escritorio y móvil; el coche no debe tapar texto, buscador ni botones.
2. Subir `/tmp/opencode/ficha-test.png` o un PDF de ficha técnica; revisar los campos y continuar.
3. Abrir `#compra`; probar filtros y “Diagnosticar esta versión”.
4. Abrir `#chat` y escribir una consulta con marca, modelo y motor.
5. Desactivar WebGL para comprobar el fallback de la portada.

## 8. Recomendación siguiente

La prioridad ya no es añadir más interfaz, sino convertir las fichas de vehículo en una base de averías verificable:

1. Seleccionar una versión y un motor concretos.
2. Reunir fuentes técnicas y casos reales documentados.
3. Crear registros con síntomas, causas, comprobaciones y solución.
4. Revisar cada lote con un especialista.
5. Marcar con claridad lo documentado, lo genérico y lo pendiente.

Hasta entonces, la aplicación debe seguir mostrando el estado real y no sugerir que existen 200 averías específicas que no están respaldadas.

## Anexo A. Correspondencia con los 19 puntos de la Fase 14

| Punto solicitado | Estado | Dónde se documenta |
|---|---|---|
| 1. Estado inicial | Documentado | Sección “Estado inicial” |
| 2. Problemas encontrados | Documentado | Sección 3 y limitaciones |
| 3. Archivos modificados | Documentado | Sección 5 |
| 4. Archivos nuevos | Documentado | Sección 5 |
| 5. Copia de seguridad | Hecha y verificada | Sección 6 |
| 6. Mejoras de interfaz | Portada, escáner y compra | Secciones 1.1–1.3 |
| 7. Método de representación 3D | Three.js procedural estilizado | Secciones 1.1 y 4.5 |
| 8. Averías nuevas verificadas | **0 nuevas** | Sección 4.1 |
| 9. Marcas, modelos y motores incorporados | **0 nuevos**; 10 fichas previas | Sección 4.2 |
| 10. Documentación técnica integrada | 0 nueva; 10 dossiers previos | Sección 4.3 |
| 11. Esquemas eléctricos disponibles | **0** | Sección 4.3 |
| 12. Cajas de fusibles documentadas | **0** | Sección 4.3 |
| 13. Manuales y procedimientos añadidos | **0** | Sección 4.3 |
| 14. Fuentes consultadas | Sin fuentes nuevas; datos previos auditados | Sección 4.4 |
| 15. Pruebas realizadas | 79/79 y QA de navegador | Sección 2 |
| 16. Errores corregidos | 8 incidencias documentadas | Sección 3 |
| 17. Problemas pendientes | Averías, biblioteca, cobertura y hardware | Sección 4 |
| 18. Permisos e integraciones | Gemini, YouTube, ELM327, manuales, VIN | Sección 4.7 |
| 19. Mejoras recomendadas | Base de averías verificable | Sección 8 |

## Anexo B. Archivos de entrega

- Informe principal: `INFORME_REMODELACION_2026-10-23.md`.
- Copia en Escritorio: `/home/selupiro/Escritorio/INFORME_REMODELACION_2026-10-23.md`.
- Progreso acumulado: `PROGRESO_IA.md`.
- Backup final: `backups/remodelacion-final-20261023-231200.tar.gz`.
- Verificación SHA256: `backups/remodelacion-final-20261023-231200.tar.gz.sha256`.
