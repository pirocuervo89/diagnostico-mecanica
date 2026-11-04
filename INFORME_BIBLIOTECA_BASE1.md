# Informe — continuación de `base 1` (biblioteca técnica) — OBSOLETO

> **Documento obsoleto (29/10/2026):** la Biblioteca técnica se eliminó de la aplicación. Sus datos, rutas y vista ya no existen; solo se conserva una copia en `backups/biblioteca-tecnica-20261029.tar.gz`. Este informe se mantiene como registro histórico y no describe el estado actual.

Fecha: 25/10/2026 20:00
Proyecto: `/home/selupiro/diagnostico-mecanica`
Prompt ejecutado: `/home/selupiro/Escritorio/base 1`

## 1. Dónde se había quedado

La sesión anterior quedó cortada entre las 14:25 y las 14:28, justo después de descargar y normalizar las fuentes y de reconstruir la biblioteca. No se había perdido nada: los datos estaban descargados, el manifiesto actualizado y la biblioteca generada.

Comprobado antes de tocar nada:

- `data/imports/manifest.json` (actualizado 14:26) registra las 7 fuentes con su licencia y sus recuentos.
- `data/technical-library.json` (14:28) tenía 37.114 entradas y 27 categorías.
- `npm run technical:check` ya daba 0 errores.
- `npm test`: 81/81 antes de esta sesión, 92/92 después de añadir las pruebas de IA y de servidor.

Lo que **no** estaba terminado era la verificación de que lo importado se presentara con honestidad y el informe de cierre.

## 2. Defecto encontrado y corregido

**Las categorías inflaban su cobertura.** Al filtrar por `torque-specs` (Pares de apriete) la web devolvía 16.365 fichas de homologación de la EEA (por ejemplo, un Abarth 500E), no pares de apriete. Lo mismo en conectores, sensores, tensiones, ECU, manuales, esquemas y ADAS.

Causa: el generador asignaba categorías "relacionadas" a las fichas de vehículo y luego contaba `propias + relacionadas` como datos de la categoría, y la etiqueta de cobertura salía "Con datos".

Corregido en la fuente, no solo en pantalla:

- `scripts/build-technical-library.mjs`: `dataCount`, `sourceCount` y los recuentos de estado se calculan **solo con entradas propias** de cada categoría; se añade `relatedDataCount` y un estado de cobertura `related` («Solo relaciones»); el resumen del build ya separa las cuatro coberturas.
- `scripts/verify-technical-library.mjs`: informa de las categorías «solo con entradas relacionadas».
- `public/js/app.js`: la tarjeta de categoría muestra las entradas propias y, aparte, `+N` relacionadas; las fichas que aparecen por relación llevan la etiqueta **Relacionada**; la cabecera de la biblioteca dice «N con datos · M solo relaciones».
- `public/css/reforma.css`: punto gris para el estado `related`.
- `tests/casos.test.mjs`: la prueba de biblioteca ya no fija la cifra inflada y ahora comprueba que «Pares de apriete» tiene 0 entradas propias y que sus resultados llegan marcados como relacionados.

Resultado: **17 categorías con datos propios, 2 solo con fuentes, 8 solo con relaciones, 0 pendientes**. Antes se anunciaban 25 «con datos».

## 3. Estado real de la biblioteca

- **37.114 entradas** en 27 categorías, sin cambios de volumen tras la corrección.
- Tipos: 17.536 especificaciones de vehículo · 9.533 DTC genéricos · 9.390 DTC de fabricante · 132 PID · 109 campañas NHTSA · 193 tutoriales · 91 inspecciones · 58 definiciones CAN · 53 fuentes · 15 dossiers · 4 guías.
- Las 16.066 fichas de homologación de la EEA llevan dentro sus **75.733 variantes** (versión, matriculaciones, masa), consultables en el detalle de cada ficha.
- Filtros comprobados: marca (SEAT: 151 resultados), categoría con datos reales (`obd-dtc-pids`: 19.074), categoría solo-relaciones (`torque-specs`: 16.365, todas marcadas `related`).

## 4. Fuentes y licencias verificadas

| Fuente | Licencia | Importado |
|---|---|---|
| OBDeX (`foerbsnavi/obdex`) | CC0-1.0 | 9.533 DTC + 132 PID (modo 01 y 09) |
| Wal33D/dtc-database | MIT | 9.390 DTC de fabricante |
| Open-EV Data v1.24.0 | CDLA-Permissive-2.0 | 1.189 vehículos eléctricos |
| EEA CO2 cars 2025 | CC BY 4.0 | 16.066 modelos + 75.733 variantes |
| Autoseeker | CC BY 4.0 | 281 modelos |
| NHTSA API | Dominio público EE. UU. | 109 campañas de seguridad |
| commaai/opendbc | MIT | 58 definiciones DBC |

Cada registro conserva su `sourceIds`, licencia, clase de licencia y atribución; `npm run technical:check` valida además el SHA256 de los archivos importados contra `manifest.json`.

## 5. Qué sigue faltando (declarado, no rellenado)

- **Pares de apriete, esquemas eléctricos, pinouts, curvas de sensores y manuales de taller propios: 0 entradas.** No se han encontrado conjuntos con licencia que permita redistribuirlos. No se han inventado valores ni se han copiado documentos de pago.
- **ADAS**: solo relaciones, sin fichas propias.
- **Datos de fabricante europeo** (sección 3 del prompt): no existe acceso libre y redistribuible a la documentación técnica de los fabricantes. El Reglamento (UE) 2018/858 obliga a dar acceso a operadores independientes, pero eso no autoriza a republicar los documentos en una web.
- **NHTSA vPIC** (sección 2.4): no importado. Añadiría decenas de miles de modelos estadounidenses y diluiría el catálogo europeo; se deja como fuente disponible, no como relleno.
- **Imágenes y diagramas** (secciones 9-11): sin material con licencia compatible. Crear ilustraciones originales es trabajo editorial aparte y no se ha simulado como si fueran oficiales.

## 6. Pruebas ejecutadas

- `npm test`: **92/92** (incluye la prueba nueva de cobertura honesta y las 9 del proveedor de IA).
- `npm run technical:check`: **0 errores**, 37.114 entradas, 27 categorías, integridad SHA256 correcta.
- `npm run symptoms:check`: 454 síntomas, 0 errores.
- API comprobada tras la reconstrucción: `/api/technical/meta`, filtros por marca, categoría con datos y categoría solo-relaciones.
- La reconstrucción de la biblioteca tardó ~20 s y no bloqueó el equipo (memoria disponible estable durante el proceso).

## 7. Copias de seguridad y control de versiones

- Commit `a9bf88f` con el proyecto completo antes de esta continuación.
- `backups/post-ia-20261025-191801.tar.gz`
- `backups/estado-pre-limpieza-20261025-192736.tar.gz`
- `backups/pre-auditoria-20261025-185022.tar.gz`

Los cambios de esta continuación (generador, verificador, interfaz, estilos, pruebas y este informe) están sin commitear.

## 8. Conclusión

La importación de `base 1` estaba completa; lo que faltaba era dejar de presentar datos relacionados como si fueran propios. Eso está corregido en el generador, en el verificador, en la interfaz y en las pruebas. La biblioteca es hoy honesta sobre lo que tiene y sobre lo que no.
