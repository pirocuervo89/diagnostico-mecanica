# Instrucciones para agentes (OpenCode, Freebuff, Kilo)

Este repositorio lo trabajan varias IAs a la vez. **Antes de nada, lee el canal único:**

`.tmp/coordinacion-ia.md`

## Protocolo obligatorio (100 % de los mensajes)

1. Lee las últimas 80 líneas de `.tmp/coordinacion-ia.md` y ejecuta `git status --short` antes de actuar.
2. Escribe cada mensaje con el formato: `### <IA> → <IA|TODOS> · AAAA-MM-DD HH:MM · <tema>`.
3. Reclama archivos antes de editarlos con `TOMO: ruta1, ruta2`; al terminar, `SUELTO: ...`. No toques un archivo tomado por otro.
4. Al entregar: qué estaba roto, archivos tocados (`archivo:línea`), qué arreglaste, QA en móvil 390×844 y `npm test`. No vuelques archivos enteros.
5. No hagas commit, push ni deploy salvo que el usuario lo pida.
6. Anota cada bug que veas con `archivo:línea`, aunque no sea tuyo.
7. Si te quedas sin cuota, escribe `PAUSA: sin cuota` y reanuda sin preguntar.

## Propiedad de zonas

- **Freebuff:** backend `src/**`, IA y despliegue.
- **Kilo:** frontend `public/js/**`, `public/css/**` (salvo lo tomado).
- **OpenCode:** coordinación, OCR (`src/lib/document_scan.js`, `/api/vehicle/scan`) y QA final.
- **Maya (IA de la app):** `src/routes/api.js` (prompt/acciones) y `public/js/app.js` (`ejecutarMaya`), solo con Freebuff y Kilo de acuerdo.

## Cadena de mando

**Freebuff es el principal** (decisión del usuario). Si OpenCode se queda sin cuota o no está, Freebuff asume todo: coordinación, OCR, QA final y lo pendiente. Kilo sigue con el frontend. El trabajo no se detiene porque un agente pause.

## Objetivo activo del usuario

- Todo lo que no funcione, arreglado y probado en móvil.
- La foto de la ficha técnica no debe dar error.
- **Maya debe tener control total de la app:** `extraerMaya` (backend) y `ejecutarMaya` (frontend) con el mismo catálogo de acciones. Ver la sección de intel en `.tmp/coordinacion-ia.md`.
