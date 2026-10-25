# Informe de cierre — Fase 2

Fecha: 2026-10-25  
Proyecto: `/home/selupiro/diagnostico-mecanica`  
Prompt ejecutado: `/home/selupiro/Escritorio/fase2`  
Servidor de comprobación: `http://localhost:3000`  
PID final: `263491`  
Log: `/tmp/opencode/dym-server.log`

## Veredicto

La fase 2 queda cerrada en lo que puede verificarse con los datos y el entorno disponibles. La aplicación arranca, la biblioteca técnica tiene **818 entradas únicas en 45 categorías**, el catálogo de vehículos pasa de **10 a 15 fichas**, la lectura OBD se amplía a **24 PID estándar** con **8 relojes** y **25 parámetros instantáneos**, y la suite queda en **81/81 pruebas correctas**.

No se presenta como cobertura universal ni como validación con hardware real. Siguen faltando manuales oficiales licenciados, el lote de 200 averías nuevas por motor y la prueba con un ELM327 físico. No se han inventado datos para tapar esas carencias.

## 1. Resultado por áreas

### 1.1 Biblioteca técnica

- **45 categorías** en `data/technical-categories.json`, agrupadas y numeradas.
- **818 entradas** generadas en `data/technical-library.json`:
  - 193 tutoriales.
  - 91 inspecciones.
  - 454 síntomas.
  - 30 PID.
  - 30 fuentes.
  - 15 fichas de vehículo.
  - 4 guías genéricas.
  - 1 índice DTC.
- **30 fuentes** en `data/technical-sources.json`; **29 respondieron HTTP 200** y 1 quedó en HTTP 0 (`src-vw-es-golf-r`), marcada como comprobación fallida.
- Estados diferenciados:
  - `generic`: 458.
  - `metadata_only`: 193.
  - `reviewed`: 92.
  - `verified`: 45.
  - `source_only`: 30.
- Cobertura: **39 categorías con datos propios**, **6 solo con fuentes externas**, **0 pendientes**.
- Las 6 categorías sin documentos propios son: manuales de taller, esquemas eléctricos, pares de apriete, secuencias de montaje, tiempos de reparación y oscilogramas avanzados. La interfaz las muestra como “solo fuente” y advierte que no se ha copiado ni validado el contenido externo.
- API montada en `/api/technical`: metadatos, cobertura, fuentes, PID, listado filtrable y detalle.
- Integración con `/api/search`, `/api/stats` y `/api/chat` mediante referencias técnicas trazables.

### 1.2 Vehículos añadidos

Se han incorporado 5 fichas nuevas a `data/vehicles.json`:

| Marca | Modelo | Versión | Años | Motor declarado | Potencia / par | Cambio | Confianza |
|---|---|---|---|---|---|---|---|
| Volkswagen | Golf IV | 1.9 TDI 110 | 1997–2003 | AHF / ASV / ALH, pendiente de VIN | 110 CV / 235 Nm | Manual 5v o automático 4v | media |
| Volkswagen | Golf V | 2.0 TDI 140 | 2003–2008 | BKD, pendiente de VIN | 140 CV / 320 Nm | Manual 6v o DSG 6v | media |
| Peugeot | 205 | 1.9 GTI | 1986–1994 | XU9JA, pendiente de documentación | 130 CV / 161 Nm | Manual 5v | media |
| Peugeot | 206 | 2.0 HDi 90 | 1999–2009 | RHY (DW10TD), pendiente de VIN | 90 CV / 205 Nm | Manual 5v | media |
| Peugeot | 308 III | 1.5 BlueHDi 130 EAT8 | 2021–2026 | DV5R, pendiente de VIN | 130 CV / 300 Nm | EAT8 8v | media |

Cada ficha incluye:

- Especificaciones de motor, transmisión, emisiones y sistemas.
- Entre 6 y 7 puntos de inspección.
- 2 problemas o precauciones documentadas.
- Guía de compra con prioridades y veredicto editorial.
- Fuente de Wikipedia y fecha de consulta.
- Imagen representativa con crédito, licencia y aviso de que puede no coincidir con la versión exacta.

Totales de vehículos: **15 fichas, 91 puntos de inspección, 20 problemas conocidos, 18 referencias de fuente (16 URL únicas)**.

Las 5 imágenes nuevas están en JPG y WebP a 1200×800 en `public/img/vehiculos/`: `golf-iv`, `golf-v`, `peugeot-205`, `peugeot-206` y `peugeot-308`.

### 1.3 Instrumentación OBD

- El parser reconoce ahora **24 PID estándar** del modo 01, con fórmula, unidad y decodificación documentadas en `data/obd-pids.json`.
- Parámetros añadidos: correcciones de combustible, presión de colector, avance, sonda lambda, presión de rail, nivel de combustible, presión barométrica, temperatura de aceite, consumo, temperatura de catalizador, temperatura de DPF, par real y tensión del módulo.
- El simulador virtual responde a esos PID y genera valores coherentes, sin presentarse como lectura real.
- El cuadro OBD pasa de 4 a **8 relojes**: RPM, refrigerante, carga, batería, velocidad, aceite, presión de turbo y lambda.
- La parrilla instantánea muestra hasta **25 tarjetas**: MAF, MAP, turbo, barométrica, avance, correcciones, lambda, sonda, nivel, rail, consumo, catalizador, DPF, par y más.
- Se añadió hora de última lectura y aviso de que solo se muestran los PID que responden a la ECU.
- Se evita el solapamiento de lecturas periódicas mediante un bloqueo de telemetría en curso.
- Los PID no soportados se omiten; no se rellenan con valores simulados cuando el modo es real.
- El modo simulado se etiqueta siempre como `SIMULADOR VIRTUAL`; al desconectar vuelve a `SIN CONEXIÓN`.

### 1.4 Escáner de vehículo y compra

- Corregida la desambiguación del escáner al añadir nuevos Golf: la puntuación por potencia exacta evita que un “Golf 2.0 TDI 150” quede sin ficha o se confunda con el 2.0 TDI 140.
- Añadidos alias para Golf IV, Golf V, Peugeot 205 GTI, Peugeot 206 HDi y Peugeot 308 BlueHDi.
- `/api/buying` devuelve ahora 15 fichas y los filtros de marca incluyen Peugeot con 3 versiones.
- Corregido el singular/plural de “fuente/fuentes” en biblioteca, compra, ficha de vehículo y buscador.

## 2. Registros nuevos de esta fase

Se añadieron **40 entradas técnicas únicas** a la biblioteca:

| Categoría | Entradas nuevas |
|---|---:|
| Motores y especificaciones | 10 |
| Mantenimiento programado | 8 |
| EGR | 3 |
| Distribución y calado | 3 |
| Frenos | 2 |
| Embragues y volantes bimasa | 2 |
| Inyección diésel | 2 |
| DPF/FAP | 2 |
| Diagnosis de fabricante | 2 |
| Dirección y suspensión | 2 |
| Turbo y sobrealimentación | 2 |
| Automáticas y DSG | 1 |
| Refrigeración | 1 |
| **Total** | **40** |

Desglose por tipo: 5 fichas de vehículo, 30 inspecciones y 5 registros de fuente. Además, `data/vehicles.json` incorpora 5 fichas completas y `data/technical-sources.json` pasa de 25 a 30 fuentes.

## 3. Fuentes consultadas

- **30 fuentes registradas**. 29 con HTTP 200; 1 con HTTP 0 y sin presentar como verificada.
- Las 5 fuentes nuevas son páginas de Wikipedia sobre Golf Mk4, Golf Mk5, Peugeot 205, Peugeot 206 y Peugeot 308, con licencia CC BY-SA 4.0 y consulta del 2026-10-25.
- Se mantienen fuentes de OBD-II PIDs, portales de fabricante, documentación de proveedores y repositorios públicos ya registrados en fases anteriores.
- Las fuentes de Wikipedia sirven para datos generales de plataforma y modelo; **no confirman por sí solas pares, capacidades, calados, fusibles ni procedimientos**. Esa limitación queda escrita en cada registro.
- No se ha accedido a manuales de pago, áreas privadas ni contenido protegido.

## 4. Pruebas ejecutadas

### Automatizadas

- `npm test`: **81/81 correctas**, 0 fallos, 0 canceladas.
- Nuevas comprobaciones incluidas:
  - 818 entradas técnicas y 45 categorías.
  - 30 PID y fórmulas.
  - Filtros por categoría, vehículo, búsqueda y 404.
  - Chat con referencias técnicas.
  - 5 vehículos nuevos con motor, inspecciones, problemas y fuentes.
  - Escáner de Golf IV y Peugeot 205 GTI.
  - Decodificación de PID adicionales y telemetría simulada de 24 parámetros.
- `npm run technical:check`: **818 entradas, 45 categorías, 0 errores**.
- `npm run symptoms:check`: **454 síntomas, 9 categorías, 0 errores**.
- `node scripts/verify-products.mjs`: **500/500 productos**, 0 errores estructurales.

### Navegador real

- QA global de **14 vistas** a **1440, 768 y 390 px**: una sola vista activa, **0 overflow horizontal**, **0 imágenes rotas** y **0 errores de consola/pageerror**.
- Biblioteca técnica:
  - 46 botones de categoría (incluye “Todas”).
  - 40 tarjetas por página.
  - Filtro EGR, búsqueda P0299, detalle y categoría solo-fuente verificados.
  - Rail de categorías con scroll contenido en tablet y móvil.
- Vehículos:
  - 15 fichas en el índice.
  - Las 5 imágenes nuevas cargan en 1440, 768 y 390 px.
  - Sin overflow; ficha y relaciones abren correctamente.
- Compra:
  - 15 tarjetas.
  - Búsqueda “205 GTI” → 1 resultado.
  - “Ver ficha completa” abre la ficha correcta.
  - Sin overflow en 390 px.
- OBD simulado:
  - Conexión, 8 relojes y 25 tarjetas con datos.
  - Estado `SIMULADOR VIRTUAL` y última lectura visibles.
  - Desconexión vuelve a `SIN CONEXIÓN`.
  - Sin errores de consola ni overflow en 1440 y 390 px.

## 5. Archivos principales modificados o añadidos

- `data/vehicles.json`: 5 fichas nuevas, 15 totales.
- `data/technical-sources.json`: 30 fuentes.
- `data/technical-library.json`: regenerado con 818 entradas.
- `public/img/vehiculos/golf-iv.{jpg,webp}` y las 4 imágenes nuevas restantes.
- `src/lib/document_scan.js`: desambiguación y alias de nuevos vehículos.
- `src/routes/api.js`: recuentos, fuente singular y datos actualizados.
- `public/index.html`: 8 relojes OBD, última lectura y aviso de PID.
- `public/js/obd.js`: parser ampliado, simulador y lectura sin solapamientos.
- `public/js/app.js`: relojes, parrilla instantánea, etiquetas y buscador.
- `public/js/buying.js`: singular/plural de fuentes.
- `tests/casos.test.mjs`: pruebas de biblioteca, vehículos, escáner y OBD.
- `INFORME_FASE2_2026-10-25.md`: este informe.

## 6. Limitaciones y tareas no completadas

1. **Sin manuales oficiales licenciados** para esquemas, fusibles, relés, pares, capacidades, distribución y procedimientos completos. Las 6 categorías solo-fuente no tienen documento propio.
2. **Sin ELM327 físico**. La conexión Web Serial/Bluetooth está implementada, pero en esta sesión solo se ha validado el simulador. No se afirma que funcione con un adaptador concreto.
3. **Lote de 200 averías nuevas por motor: no completado**. Hay 20 problemas conocidos y 91 inspecciones; no se han duplicado síntomas genéricos para aparentar 200 registros.
4. **Cobertura de vehículos parcial**: 15 fichas, no el universo europeo solicitado. Los datos de las 5 fichas nuevas son de confianza media y los códigos de motor deben confirmarse por VIN.
5. **Biblioteca mayoritariamente genérica**: 458 entradas `generic` y 193 `metadata_only` frente a 45 `verified`. No debe interpretarse como 818 procedimientos oficiales verificados.
6. **Una fuente con HTTP 0**: `src-vw-es-golf-r`; queda marcada y no se presenta como verificada.
7. **Gemini sin cuota disponible**. El chat funciona con el motor local y referencias internas; no se simuló una respuesta de Gemini.
8. **Imágenes representativas**: pueden mostrar otro acabado o motorización; cada ficha lo indica.

## 7. Cómo iniciar y probar

```bash
cd /home/selupiro/diagnostico-mecanica
npm install
npm start
```

Abrir `http://localhost:3000`.

Comprobaciones:

```bash
npm test
npm run technical:check
npm run symptoms:check
node scripts/verify-products.mjs
```

Rutas útiles:

- `#biblioteca` → modo “45 categorías técnicas”.
- `#vehiculos` → fichas y guía de compra.
- `#compra` → comparador editorial de 15 versiones.
- `#obd` → simulador virtual y conexión Web Serial/Bluetooth.
- `#diagnostico` → síntomas, DTC y soluciones por sistema.

## 8. Copia de seguridad

La copia final de la fase 2 es:

- `backups/fase2-final-20261025-025017.tar.gz`
- SHA256 en `backups/fase2-final-20261025-025017.tar.gz.sha256`

Incluye el código, los datos, las 5 imágenes nuevas, la biblioteca, las pruebas y este informe. Excluye `.env`, `.env.local`, `.git`, `node_modules`, `backups`, bases SQLite del foro y tutoriales, uploads y mensajes de contacto.

La referencia previa a la fase 2 es:

- `backups/pre-fase2-20261023-234025.tar.gz`
- SHA256: `4fe70e3d39266e256fb88083b1911e80815087d1240258971739b636fa4ca73e`

Integridad comprobada con `gzip -t`, extracción en `/tmp/opencode/restore-fase2` y comprobación de sintaxis de `server.js`, `src/routes/technical.js`, `public/js/obd.js` y `public/js/app.js`.

## 9. Cómo continuar sin duplicar trabajo

1. Incorporar manuales o documentación licenciada por vehículo y motor; registrar URL, licencia, fecha y páginas.
2. Convertir las 6 categorías solo-fuente en fichas propias cuando exista material redistribuible.
3. Añadir nuevos vehículos con el mismo esquema, confirmando código de motor por VIN y manteniendo `confidence` explícita.
4. Ampliar averías solo con fuente técnica o caso revisado; no derivar averías de síntomas genéricos.
5. Validar la conexión OBD con un ELM327 físico y registrar protocolo, versión y PID realmente soportados.
6. Ejecutar de nuevo `npm run technical:build`, `npm run technical:check` y `npm test` después de cada lote.
7. No reutilizar una imagen o un dato de otra versión sin indicarlo.
