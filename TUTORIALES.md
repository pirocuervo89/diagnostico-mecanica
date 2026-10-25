# Biblioteca de tutoriales

Módulo integrado en Diagnóstico y Mecánica para buscar, consultar y guardar tutoriales automotrices verificados de YouTube.

## Estado actual

- **193 tutoriales** reales importados y verificados con YouTube oEmbed.
- **20 categorías** principales y **429 subcategorías**; la semilla cubre **55 subcategorías**.
- Idiomas: **190 español**, **2 inglés**, **1 francés**.
- **161 vídeos** incluyen advertencias de seguridad.
- **0 IDs, URLs o títulos duplicados** en la semilla.
- Todos los vídeos están marcados como verificados en su fuente; la exactitud técnica del contenido no se ha revisado manualmente.
- La semilla se importa automáticamente en `data/tutorials.sqlite` la primera vez que arranca el servidor.

## Puesta en marcha

```bash
npm install
npm start
```

Abrir `http://localhost:3000/#tutoriales`.

La biblioteca local funciona sin claves externas. `YOUTUBE_API_KEY` solo es necesaria para buscar vídeos desde el panel de administración con YouTube Data API v3.

## Variables de entorno

| Variable | Uso | Obligatoria |
| --- | --- | --- |
| `PORT` | Puerto HTTP | No, por defecto `3000` |
| `HOST` | Interfaz de escucha | No, por defecto `0.0.0.0` |
| `TUTORIAL_DB_PATH` | Ruta de la base SQLite | No |
| `TUTORIAL_SEED_PATH` | Ruta de la semilla JSON | No |
| `TUTORIAL_CATEGORIES_PATH` | Ruta del catálogo de categorías | No |
| `YOUTUBE_API_KEY` | Búsqueda con YouTube Data API v3 | Solo para búsqueda remota desde admin |
| `FORUM_DB_PATH` | Base del foro; si se define, la base de tutoriales se crea en su mismo directorio | No |
| `FORUM_UPLOAD_DIR` | Adjuntos del foro | No |

Variables disponibles en `.env.example`. La base SQLite y sus archivos WAL están excluidos de Git.

## Archivos principales

- `data/tutorial-categories.json`: 20 categorías y 429 subcategorías.
- `data/tutorials-seed.json`: semilla de 193 vídeos con metadatos verificados.
- `data/tutorials.sqlite`: base local generada automáticamente.
- `src/lib/tutorial_db.js`: esquema, búsqueda, favoritos, historial, listas, reportes, moderación, estadísticas e importación.
- `src/lib/tutorial_providers.js`: parseo de YouTube, oEmbed y búsqueda opcional con Data API.
- `src/routes/tutorials.js`: API REST bajo `/api/tutorials`.
- `public/js/tutorials.js`: interfaz de búsqueda, ficha, biblioteca, listas y moderación.
- `public/css/tutorials.css`: estilos del módulo.
- `public/index.html`: vista, navegación, modal y panel de administración.
- `tests/tutoriales.test.mjs`: pruebas de API, permisos, persistencia y moderación.

## Fuentes y verificación

- **YouTube oEmbed** (`https://www.youtube.com/oembed`): verifica que el vídeo existe, devuelve título, canal y miniatura. No requiere clave.
- **YouTube Data API v3**: opcional; añade búsqueda, duración, descripción, fecha y métricas. Requiere `YOUTUBE_API_KEY`.
- **Búsqueda pública de YouTube**: se usó durante la curación de la semilla, no en tiempo de ejecución.
- No se descargan vídeos ni se alojan archivos multimedia.
- Si un vídeo no permite inserción, la ficha muestra su miniatura y un botón para abrirlo en YouTube.

La semilla se reimporta cuando cambia el tamaño o la fecha de modificación de `data/tutorials-seed.json`. La importación usa `UPSERT` por ID: actualiza los vídeos existentes y no borra importaciones manuales que ya no estén en la semilla.

## API

Base: `/api/tutorials`.

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| GET | `/meta` | Público | Categorías, estadísticas y proveedores |
| GET | `/` | Público | Búsqueda, filtros, orden y paginación |
| GET | `/:id` | Público | Ficha y relacionados |
| GET | `/suggestions?q=` | Público | Autocompletado |
| POST | `/:id/view` | Público | Registra visita local |
| POST | `/:id/favorite` | Sesión | Alterna favorito |
| GET | `/library` | Sesión | Favoritos, historial y listas |
| GET/POST | `/playlists` | Sesión | Listar o crear listas |
| POST/DELETE | `/playlists/:id/items` | Sesión | Añadir o quitar tutoriales |
| POST | `/:id/report` | Sesión | Enviar aviso |
| GET/PATCH | `/admin/reports` | Moderación | Cola y resolución de avisos |
| POST | `/admin/tutorials/:id/visibility` | Moderación | Ocultar o restaurar |
| POST | `/admin/import` | Admin | Importar JSON validado |
| POST | `/admin/verify-youtube` | Admin | Verificar URL con oEmbed |
| POST | `/admin/search-youtube` | Admin | Buscar con Data API |

Filtros disponibles: `q`, `category`, `subcategory`, `brand`, `model`, `engine`, `year`, `fuel`, `language`, `level`, `sourceType`, `duration`, `vehicleType`, `dtc`, `symptom`, `free`, `embeddable`, `withWarnings`, `sort`, `limit` y `offset`.

## Permisos y seguridad

- La autenticación reutiliza la cookie HttpOnly `dym_forum_session` del foro.
- Favoritos, historial y listas anónimos se guardan en `localStorage`; con sesión se sincronizan en SQLite.
- Importar, verificar y buscar en YouTube requiere rol `admin`.
- La cola de reportes y la ocultación de contenido requieren `admin` o `moderator`.
- Las rutas validan IDs, categorías, límites, motivos de reporte y tamaño de importación.
- Los errores de validación devuelven JSON con el código HTTP correcto.
- La clave de YouTube nunca se envía al navegador.
- Los vídeos se insertan con `youtube-nocookie.com` y `referrerpolicy="strict-origin-when-cross-origin"`.

## Pruebas ejecutadas

- `npm test`: **65/65** pruebas correctas, incluidas 11 específicas de tutoriales.
- API: metadatos, búsqueda, filtros, paginación, sugerencias, ficha, visitas, favoritos, historial, listas, reportes, permisos, importación, duplicados, ocultación y persistencia tras reinicio.
- Navegador real Chromium: 193 tutoriales, 24 tarjetas iniciales, búsqueda P0299, modal con iframe, biblioteca, campos de administración, móvil 390 px sin overflow y **0 errores de consola**.
- Integración verificada en navegador desde DTC, síntomas y un caso del foro.
- Regresión: catálogo Amazon, DTC, síntomas, IA local, OBD y foro siguen pasando.

## Límites conocidos

- Sin `YOUTUBE_API_KEY`, el panel no puede buscar vídeos nuevos en YouTube; sí puede verificar una URL concreta y usar la biblioteca local.
- La semilla cubre 55 de las 429 subcategorías. La arquitectura permite ampliarla, pero no se afirma haber cubierto todo YouTube.
- oEmbed verifica disponibilidad y metadatos básicos; no garantiza que el autor mantenga el vídeo público ni que el procedimiento sea técnicamente correcto.
- No hay revisión editorial manual de los 193 vídeos.
- Los filtros de marca, modelo y motor solo devuelven resultados cuando el vídeo declara esa compatibilidad.
- La biblioteca es local; no hay sincronización entre dispositivos salvo la base del servidor.

## Copia de seguridad

Backup previo al módulo:

- `backups/pre-tutoriales-20261023-004600.tar.gz`
- SHA256: `987f04e61035500a32cf2971bded45de98e20ded9111f5162aeb4365becfc674`
- 322 entradas verificadas.

Para respaldar la biblioteca:

```bash
tar -czf backups/tutoriales-$(date +%Y%m%d-%H%M%S).tar.gz data/tutorials.sqlite data/tutorials-seed.json data/tutorial-categories.json
sha256sum backups/tutoriales-*.tar.gz
```

Para restaurar, detener el servidor y extraer el archivo sobre la raíz del proyecto.
