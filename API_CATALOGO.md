# Catálogo de APIs gratuitas — Diagnóstico y Mecánica / MAYA

> Documento generado a partir de la auditoría del proyecto y de una investigación
> verificada (noviembre de 2026). **Coste cero por defecto**: solo se listan
> servicios con plan gratuito permanente o cuota gratuita utilizable. Las APIs de
> pago se marcan como "solo si se autoriza".
>
> Regla de trabajo: **no se ha modificado código ni se ha integrado nada**.
> Este documento presenta el plan y espera autorización antes de tocar el
> proyecto (sección 7).

---

## 0. Resumen ejecutivo

- El proyecto ya tiene una cadena de IA robusta (Groq → OpenRouter → Mistral →
  Cerebras → OpenAI → Gemini → Pollinations) con fallback al motor experto local,
  además de Whisper (Groq), Gemini para visión/OCR, DuckDuckGo + Wikipedia +
  StackExchange para búsqueda, Nominatim/OSRM/Overpass para mapas y Supabase
  para copias de seguridad.
- Las carencias reales son: **TTS de calidad en español** (hoy usa Google Translate
  TTS, frágil), **OCR estructurado de fichas técnicas** (hoy Gemini, sin
  alternativa), **datos automovilísticos oficiales** (DTC y especificaciones se
  mantienen a mano) y **meteorología** (no integrada).
- Lo más rentable y gratuito para añadir: **Open-Meteo** (meteo, sin clave, pero
  solo no comercial → ver aviso), **OCR.space** (OCR gratis sin tarjeta),
  **Cloudflare Workers AI** (segunda IA gratuita, ~80 modelos, Whisper incluido),
  **OpenRouteService** (rutas reales, clave gratuita), **NHTSA vPIC + base DTC
  MIT** (datos oficiales de vehículos y códigos).
- Coste estimado de la ampliación propuesta: **0 €** si se respetan los límites
  gratuitos y la no comercialidad de Open-Meteo; si la app genera ingresos
  (afiliados/Stripe), Open-Meteo deja de ser gratuito y hay que pagar ~9 €/mes
  o autoalojarlo.

---

## 1. Auditoría del proyecto actual

### 1.1 Servicios ya integrados (no duplicar)

| Área | Servicio | Dónde | Clave |
|---|---|---|---|
| IA texto | Groq, OpenRouter, Mistral, Cerebras, OpenAI, Gemini, Pollinations | `src/lib/ai_provider.js` | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` |
| IA visión | Gemini, OpenAI, OpenRouter, Mistral, Groq, Cerebras | `src/lib/ai_provider.js` | mismas |
| STT | Groq Whisper large-v3-turbo, Gemini | `src/lib/voice_transcribe.js` | `GROQ_API_KEY`, `GEMINI_API_KEY` |
| Búsqueda web | DuckDuckGo (lite+html), Wikipedia, StackExchange, r.jina.ai | `src/lib/web_search.js` | ninguna |
| Mapas/rutas | Nominatim, OSRM, Overpass, Google Maps (enlaces) | `src/routes/ruta.js`, frontend | ninguna |
| OCR/documentos | Gemini (lectura de imágenes/PDF) | `src/lib/document_scan.js` | `GEMINI_API_KEY` |
| Base de datos | Supabase (backup en la nube) | `src/lib/db_persist.js` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Pagos | Stripe Checkout | `src/routes/payments.js` | `STRIPE_SECRET_KEY` |
| Afiliación | Amazon, Awin/Autodoc, AliExpress, Temu | `src/lib/tiendas.js` | varias |
| Vídeo/redes | Upload-Post | scripts | `UPLOAD_POST_API_KEY` |
| YouTube | Data API v3 | varios | `YOUTUBE_API_KEY` |

### 1.2 Variables de entorno ya usadas

`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `AI_PROVIDER`, `AI_MODEL`,
`AI_VISION_PROVIDER`, `AI_VISION_MODEL`, `POLLINATIONS_*`, `WEB_SEARCH_ENABLED`,
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_KEY`, `STRIPE_*`,
`YOUTUBE_API_KEY`, `UPLOAD_POST_*`, `CORS_ORIGIN`, `PORT`, `HOST`,
`PUBLIC_BASE_URL`, `FORUM_DB_PATH`, `TUTORIAL_*`, `WARNING_LIGHTS_PATH`.

### 1.3 Lo que falta o es frágil

1. **TTS**: se usa `translate.google.com/translate_tts` (no oficial, bloqueable).
2. **OCR de fichas**: depende solo de Gemini; sin alternativa si se agota la cuota.
3. **Datos automovilísticos**: DTC, especificaciones, mantenimientos y compatibilidad
   de piezas están en JSON locales; no hay fuente externa verificable.
4. **Meteorología**: no integrada.
5. **Traducción**: no integrada (el frontend usa Google Translate no oficial).
6. **Segunda IA gratuita independiente**: solo Pollinations (sin imágenes, lento).

---

## 2. Arquitectura recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (navegador/móvil) — nunca ve claves               │
│  - Llama solo a /api/*                                      │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│  Servidor Express (src/)                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  api_gateway.js  (NUEVO) — punto único de salida     │    │
│  │   - Lee claves de process.env                        │    │
│  │   - Rate limit por IP y por proveedor (express-rate)  │    │
│  │   - Caché en memoria con TTL por endpoint             │    │
│  │   - Rotación automática proveedor principal→secundario│    │
│  │   - Log de consumo (tokens, llamadas, errores)       │    │
│  └──────────────────────────────────────────────────────┘    │
│         │              │              │              │        │
│   ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐│
│   │ ai_provider│  │ tts.js     │  │ ocr.js    │  │ maps.js   ││
│   │ (ya existe)│  │ (nuevo)    │  │ (nuevo)   │  │ (nuevo)   ││
│   └───────────┘  └───────────┘  └───────────┘  └───────────┘│
└─────────────────────────────────────────────────────────────┘
```

Principios:
- **Claves solo en servidor**, nunca en el frontend ni en el repo.
- **Un solo punto de salida** (`api_gateway`) para aplicar límites y caché.
- **Fallback en cascada** por área: si el proveedor principal falla o agota cuota,
  se prueba el siguiente compatible; si todos fallan, se usa el motor local.
- **Sin cambios silenciosos**: cada cambio de proveedor se registra en logs.
- **Copia de seguridad**: las nuevas tablas/datos se incluyen en el backup de
  Supabase (`DB_BACKUP_*`).

---

## 3. Catálogo de APIs (ficha por servicio)

### 3.1 Inteligencia artificial conversacional

| Campo | Detalle |
|---|---|
| **Groq** (ya integrado) | OpenAI-compatible. Free: 30 RPM, 1.000 RPD, 8.000 TPM, 200.000 TPD por modelo (`gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`). Whisper: 20 RPM / 2.000 RPD. Sin tarjeta. Cuota por organización. Clave: `GROQ_API_KEY`. |
| **Google Gemini** (ya integrado) | Free: Flash/Flash-Lite/2.5 Pro/Gemma. Límites por proyecto, visibles en AI Studio, reset medianoche Pacífico. **El contenido del tier gratuito se usa para mejorar productos de Google.** Sin tarjeta. Clave: `GEMINI_API_KEY`. |
| **OpenRouter** (ya integrado) | :free models. 20 RPM, 50 RPD (1.000 RPD tras comprar 10 $ de créditos). 15-19 modelos gratuitos. Sin tarjeta. Clave: `OPENROUTER_API_KEY`. |
| **Mistral** (ya integrado) | Modo Free por defecto, cuotas bajas, visibles en consola. Requiere teléfono verificado. El contenido puede usarse para entrenamiento salvo opt-out. Clave: `MISTRAL_API_KEY`. |
| **Cerebras** (ya integrado) | **Prueba de 30 días, 5 $, requiere tarjeta.** 5 RPM, 30K TPM, 1M tokens/día. No es tier gratuito permanente. Clave: `CEREBRAS_API_KEY`. |
| **Cloudflare Workers AI** (ya integrado) | 10.000 Neurons/día gratis, sin tarjeta, ~80 modelos (Llama 3.3 70B, gpt-oss-120b, Qwen, Gemma, DeepSeek-R1 distill, Whisper, FLUX, BGE embeddings). 300 RPM text gen. Reset 00:00 UTC. Algunos modelos grandes requieren plan de pago. Endpoint OpenAI-compatible. **Muy recomendable como segundo proveedor gratuito.** Clave: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`. |
| **Z.ai GLM Flash** (NUEVO) | GLM-4.7-Flash / GLM-4.5-Flash con coste 0 en entrada y salida, sin tarjeta. Endpoint OpenAI-compatible en `https://api.z.ai/api/paas/v4`, modelo `glm-4.7-flash`. Límites por cuenta visibles en la consola. Buen español y razonamiento; se usa como segundo proveedor potente. Clave: `ZAI_API_KEY`. |
| **SambaNova Cloud** (NUEVO) | Tier gratuito sin tarjeta: 20 RPM, 20 RPD, 200K TPD por modelo (DeepSeek-V3.1, Llama 3.3 70B, gpt-oss-120b). Modelos en preview solo para evaluación. Endpoint OpenAI-compatible. Clave: `SAMBANOVA_API_KEY`. |
| **NVIDIA NIM** (NUEVO) | Endpoints gratuitos para prototipado, sin tarjeta. Límites no publicados. Tratar como secundario. Endpoint OpenAI-compatible. Clave: `NVIDIA_API_KEY`. |
| **Pollinations** (ya integrado) | Último recurso, sin clave. 1 respuesta cada ~45 s por IP. Sin imágenes. |
| **Cohere** | Trial key: 20 chat RPM, 1.000 llamadas/mes. Solo evaluación, no producción. |
| **Intern AI / Void AI / Synap** | Tiers gratuitos con cuotas generosas (90M tokens/mes, 100 RPM, etc.) pero proveedores pequeños y menos verificados. Tratar como experimentales. |
| **NVIDIA NIM** | Hosted endpoints vía Developer Program. Sin límites publicados. Solo prototipado. |
| **Hugging Face Inference** | Free tier con rate limits por modelo. Buena para embeddings y modelos pequeños. |

### 3.2 Voz (TTS / STT)

| Servicio | Tipo | Free | Clave/condición |
|---|---|---|---|
| **Groq Whisper** (ya integrado) | STT | 20 RPM, 2.000 RPD | `GROQ_API_KEY` |
| **Gemini audio** (ya integrado) | STT | tier gratuito | `GEMINI_API_KEY` |
| **Cloudflare Whisper** (NUEVO) | STT | incluido en 10.000 Neurons/día | `CLOUDFLARE_*` |
| **Google Cloud TTS** (NUEVO) | TTS | 4M chars/mes Standard/WaveNet, 1M Neural2/Chirp 3 HD. **Requiere billing habilitado (tarjeta).** Sin restricción comercial sobre la cuota. | `GOOGLE_CLOUD_TTS_KEY` |
| **Azure Speech F0** (NUEVO) | TTS | 500K chars/mes neural, 20 TPS. | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| **Amazon Polly** | TTS | 5M chars/mes Standard (12 meses legacy) o 200 $ créditos para cuentas nuevas (jul 2025+). | AWS (tarjeta) |
| **ElevenLabs** | TTS | 10K créditos/mes (~10 min). **Sin licencia comercial en free.** Sin tarjeta. | `ELEVENLABS_API_KEY` |
| **Edge TTS** (no oficial) | TTS | Gratis, sin clave. Inestable, puede romperse. | ninguna |
| **Piper / Kokoro** (self-host) | TTS | Ilimitado, local, Apache 2.0. Requiere servidor con CPU. | ninguna |
| **Deepgram** | STT/TTS | 200 $ de crédito único. | `DEEPGRAM_API_KEY` |

**Recomendación para MAYA**: añadir **Google Cloud TTS** (4M chars/mes, voces en español de calidad, licencia comercial sobre la cuota) como principal y **Piper** como fallback local sin coste. Mantener el TTS actual de Google Translate como último recurso.

### 3.3 Visión artificial y OCR

| Servicio | Free | Uso |
|---|---|---|
| **Gemini** (ya integrado) | tier gratuito | visión + OCR de documentos |
| **OCR.space** (NUEVO) | 25.000 req/mes, 500/día por IP, 1 MB, PDF hasta 3 páginas, 33 idiomas (incl. español). Sin tarjeta. | OCR rápido de imágenes y PDF cortos |
| **Google Cloud Vision** | 1.000 unidades/mes (requiere billing) | OCR de imágenes con bounding boxes |
| **Azure Document Intelligence** | 500 páginas/mes (solo 2 páginas por petición) | documentos estructurados |
| **AWS Textract** | 1.000 páginas/mes (3 meses) | texto plano |
| **Mistral OCR** | de pago (sin free) | Markdown/tablas de documentos |
| **Tesseract.js / Docling** (self-host) | ilimitado, MIT | OCR local sin coste ni red |

**Recomendación**: mantener Gemini como principal; añadir **OCR.space** como fallback sin tarjeta y **Tesseract.js** (cliente) para offline.

### 3.4 GPS, mapas y navegación

| Servicio | Free | Clave/condición |
|---|---|---|
| **Nominatim** (ya integrado) | gratis, política de uso (1 req/s, atribución ODbL) | ninguna |
| **OSRM** (ya integrado, demo público) | demo no apto para producción; self-host gratuito | ninguna |
| **Overpass** (ya integrado) | gratis, rate limits | ninguna |
| **OpenRouteService** (NUEVO) | 2.000-10.000 directions/día, 40/min, isochrones/matrix/geocoding. **Prohibido enviar PII por la API alojada.** Clave gratuita. | `OPENROUTESERVICE_API_KEY` |
| **MapLibre GL JS** (NUEVO) | renderizador open source (BSD). Tiles: usar OpenStreetMap o self-host. | ninguna |
| **Leaflet** (NUEVO) | open source (BSD). Ligero, ideal móvil. | ninguna |
| **Google Maps Platform** | 200 $/mes de crédito gratuito (~28.000 cargas de mapa estático). Requiere tarjeta y billing. | `GOOGLE_MAPS_API_KEY` |
| **Mapbox** | 50.000 cargas de mapa/mes + 100.000 requests de directions/mes. Requiere tarjeta. | `MAPBOX_TOKEN` |
| **HERE** | tier gratuito con límites por API. | `HERE_API_KEY` |
| **TomTom** | 50.000 requests/mes (trial). | `TOMTOM_API_KEY` |
| **Geoapify** | 3.000 créditos/día gratis. | `GEOAPIFY_API_KEY` |

**Recomendación**: mantener Nominatim/Overpass; añadir **OpenRouteService** para rutas reales (clave gratuita) y **MapLibre** para renderizar el mapa sin depender de Google.

### 3.5 Meteorología

| Servicio | Free | Condición |
|---|---|---|
| **Open-Meteo** | 10.000 calls/día, 5.000/h, 600/min. Sin clave. **Solo no comercial.** CC BY 4.0 (atribución). Self-host AGPLv3 ilimitado. | ninguna (no comercial) |
| **WeatherAPI.com** | 100.000 calls/mes, uso comercial permitido. | `WEATHERAPI_KEY` |
| **Visual Crossing** | 1.000 registros/día, comercial permitido. | `VISUALCROSSING_KEY` |
| **NWS (api.weather.gov)** | gratis, dominio público, solo EE. UU. | User-Agent |
| **MET Norway** | 20 req/s, CC BY 4.0. | identificar app |

**Aviso importante**: la app ya tiene ingresos potenciales (afiliados, Stripe). Si se considera comercial, **Open-Meteo gratuito no aplica** → usar WeatherAPI.com (gratis, comercial) o autoalojar Open-Meteo.

### 3.6 Búsqueda en Internet

| Servicio | Free | Condición |
|---|---|---|
| **DuckDuckGo** (ya integrado) | sin clave | scraping HTML (frágil) |
| **Brave Search API** | 5 $/mes de crédito (~1.000 requests), tarjeta para activar. 5 $/1.000 requests después. | `BRAVE_SEARCH_API_KEY` |
| **Stack Exchange** (ya integrado) | sin clave, cortesía | ninguna |
| **Wikipedia** (ya integrado) | sin clave | ninguna |
| **Jina Reader** (ya integrado) | sin clave | ninguna |
| **Serper / Tavily / Exa** | free tiers pequeños (100-1.000 req/mes). | varias |

**Recomendación**: mantener DuckDuckGo; añadir **Brave** como fuente estructurada si se quiere fiabilidad (requiere tarjeta y 5 $/mes de crédito).

### 3.7 Traducción

| Servicio | Free | Condición |
|---|---|---|
| **LibreTranslate** (self-host) | ilimitado, AGPLv3, offline. | servidor propio (Python/Docker) |
| **LibreTranslate hosted** | requiere API key de pago. | `LIBRETRANSLATE_API_KEY` |
| **DeepL** | 500.000 chars/mes gratis. | `DEEPL_API_KEY` |
| **Google Translate** (no oficial) | frágil, bloqueable. | ninguna |

**Recomendación**: si se necesita traducción, **DeepL** (500k chars/mes gratis) o self-host LibreTranslate.

### 3.8 Datos automovilísticos (DTC, especificaciones, VIN)

| Servicio | Free | Condición |
|---|---|---|
| **NHTSA vPIC** (NUEVO) | VIN decode, makes/models/years, especificaciones básicas. Sin clave, sin límite diario (1.000-2.000 trans/min). Solo vehículos destinados a EE. UU. | ninguna |
| **NHTSA recalls** (NUEVO) | recalls por make/model/year. Sin clave. | ninguna |
| **Wal33D dtc-database** (NUEVO) | 28.220+ códigos (9.415 genéricos SAE + 18.805 específicos de fabricante, 33 marcas). SQLite, MIT, offline. | self-host (descarga) |
| **VehDB** | 100 calls/mes gratis (specs, EPA, recalls). | `VEHDB_API_KEY` |
| **CarQuery API** | gratuita, sin clave (histórica). | ninguna |

**Recomendación**: integrar **NHTSA vPIC** para VINs y **Wal33D dtc-database** como base local de DTC (MIT, offline, sin dependencia de red). Esto mejora mucho el diagnóstico sin coste.

### 3.9 Memoria, base de datos y almacenamiento

| Servicio | Free | Condición |
|---|---|---|
| **Supabase** (ya integrado) | 500 MB DB, 2 GB transferencia, 50k MAU, 1 GB storage. | `SUPABASE_*` |
| **Neon** | Postgres serverless, 0,5 GB, 100h compute/mes. | `NEON_DATABASE_URL` |
| **Turso** | libSQL/SQLite, 9 GB, 500M rows leídas/mes. | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |
| **Upstash** | Redis, 10.000 comandos/día. | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |

**Recomendación**: mantener Supabase para backup; si se quiere caché de sesiones, añadir Upstash Redis (free).

### 3.10 Automatización y control autorizado

| Servicio | Free | Uso |
|---|---|---|
| **n8n** (self-host) | ilimitado, open source. | servidor propio |
| **Make / Zapier** | free tiers (1.000 ops/mes Make). | cuenta |
| **GitHub Actions** | 2.000 min/mes gratis. | ya disponible |

---

## 4. Tabla comparativa por área (resumen)

| Área | Principal recomendado | Alternativa gratuita | De pago (si se autoriza) |
|---|---|---|---|
| IA texto | Groq (ya) | Cloudflare Workers AI, Gemini, Pollinations | OpenAI |
| IA visión | Gemini (ya) | Cloudflare (Llama 4 Scout), OpenRouter :free | OpenAI gpt-4o |
| STT | Groq Whisper (ya) | Cloudflare Whisper, Gemini | Deepgram |
| TTS | Google Cloud TTS (4M chars/mes) | Piper (self-host), ElevenLabs (10K) | ElevenLabs Pro |
| OCR | Gemini (ya) | OCR.space, Tesseract.js | Mistral OCR, Google DocAI |
| Mapas render | MapLibre/Leaflet (ya OSRM) | OpenStreetMap tiles | Google Maps, Mapbox |
| Rutas | OpenRouteService | OSRM self-host | Google Routes |
| Meteo | WeatherAPI.com (comercial) | Open-Meteo (no comercial), NWS | WeatherAPI Pro |
| Búsqueda | DuckDuckGo (ya) | Brave (5 $/mes crédito) | Serper, Tavily |
| Traducción | DeepL (500k chars/mes) | LibreTranslate self-host | Google Translate |
| DTC/VIN | Wal33D (offline) + NHTSA vPIC | CarQuery | VehDB |
| Caché | Upstash Redis (free) | memoria del proceso | Redis Cloud |

---

## 5. Sistema de proveedores alternativos (fallback)

Ya existe en `ai_provider.js` para IA. Se propone generalizar el patrón a las
demás áreas con un módulo `src/lib/provider_chain.js`:

```js
// Ejemplo de cadena por área
const CHAINS = {
  tts:   ['google_cloud_tts', 'azure_speech', 'piper_local', 'google_translate_tts'],
  stt:   ['groq_whisper', 'cloudflare_whisper', 'gemini_audio'],
  ocr:   ['gemini_vision', 'ocr_space', 'tesseract_local'],
  route: ['openrouteservice', 'osrm_selfhost', 'google_maps'],
  weather:['weatherapi', 'open_meteo', 'nws'],
  search: ['duckduckgo', 'brave', 'wikipedia']
};
```

Reglas:
- Cada proveedor tiene cooldown independiente (como en `ai_provider.js`).
- Si un proveedor devuelve 429/402/401/403 o timeout, se enfría y se prueba el
  siguiente.
- El último eslabón es siempre local/offline cuando exista.
- Nunca se cambia de proveedor en silencio: se registra en logs.

---

## 6. Claves que debe obtener el propietario (coste 0)

Prioridad alta (mejoran la app ya):
1. `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` — Workers AI (segunda IA
   gratuita + Whisper + embeddings).
2. `SAMBANOVA_API_KEY` — SambaNova Cloud (tercera IA gratuita, sin tarjeta).
3. `NVIDIA_API_KEY` — NVIDIA NIM (cuarta IA gratuita, prototipado).
2. `OPENROUTESERVICE_API_KEY` — rutas reales gratuitas.
3. Descarga offline de `dtc-database` (Wal33D, MIT) — sin clave.

Prioridad media:
4. `WEATHERAPI_KEY` — meteorología con uso comercial permitido.
5. `GOOGLE_CLOUD_TTS_KEY` — TTS de calidad (requiere billing habilitado).
6. `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` — TTS alternativo.
7. `BRAVE_SEARCH_API_KEY` — búsqueda estructurada (5 $/mes crédito, tarjeta).
8. `DEEPL_API_KEY` — traducción (500k chars/mes).

Sin tarjeta / sin clave:
9. OCR.space (solo registro, clave gratuita).
10. NHTSA vPIC (sin clave).
11. MapLibre/Leaflet (sin clave).
12. Piper/Kokoro (self-host).

---

## 7. Plan de integración por fases (espera autorización)

**Fase 0 — Copia de seguridad** (antes de tocar nada)
- Backup de `data/` y del repo (`git stash`/tag). Ya hay backup en Supabase.

**Fase 1 — Datos automovilísticos (bajo riesgo, alto valor)**
- Descargar `dtc-database` (Wal33D) a `data/dtc/` y cargarlo en SQLite.
- Añadir endpoint `/api/dtc/:code` consultando la base local.
- Añadir `/api/vin/:vin` proxy a NHTSA vPIC.
- Tests de lookup.

**Fase 2 — Meteorología**
- Endpoint `/api/weather?lat=&lon=` con cadena WeatherAPI → Open-Meteo → NWS.
- Widget en la vista de ruta/garaje.

**Fase 3 — Segunda IA gratuita (Cloudflare)**
- Añadir preset `cloudflare` a `ai_provider.js` (OpenAI-compatible).
- Añadir a `AUTO_ORDER` y `AUTO_VISION_ORDER`.

**Fase 4 — TTS de calidad**
- Módulo `src/lib/tts.js` con cadena Google Cloud → Azure → Piper → Google
  Translate (actual).
- Endpoint `/api/tts` que devuelve audio (cacheado).

**Fase 5 — OCR alternativo**
- Añadir OCR.space como fallback en `document_scan.js`.
- Tesseract.js en cliente para offline.

**Fase 6 — Rutas reales**
- OpenRouteService en `src/routes/ruta.js` con fallback a OSRM.
- MapLibre en frontend (sustituir enlaces de Google Maps por mapa propio).

**Fase 7 — Caché y límites**
- `api_gateway.js` con rate limit y caché TTL.
- Log de consumo.

**Fase 8 — Pruebas y despliegue**
- Tests por proveedor (mocks).
- Verificación en móvil.
- Deploy.

---

## 8. Pruebas previstas

- Conectividad y autenticación de cada proveedor (mock + real con clave).
- Fallback: simular 429/timeout y comprobar que se prueba el siguiente.
- Límites: no superar cuotas gratuitas en tests (usar claves de prueba).
- Seguridad: claves nunca en frontend ni en logs.
- Compatibilidad móvil: TTS/STT funcionan en Chrome Android.
- Regresión: `npm test` sigue en verde (194 tests).

---

## 9. Coste estimado

| Escenario | Coste mensual |
|---|---|
| Solo APIs gratuitas (Fases 1-3, 5, 6 con OSRM) | **0 €** |
| + Google Cloud TTS (dentro de 4M chars/mes) | 0 € |
| + WeatherAPI.com (dentro de 100k calls/mes) | 0 € |
| + Brave Search (dentro de 5 $/mes crédito) | 0 € |
| Si se superan cuotas o se quiere comercialidad de Open-Meteo | ~9-24 €/mes |
| Coste máximo si todo se paga (no recomendado) | ~60 €/mes |

---

## 10. Limitaciones y riesgos

- **Open-Meteo no es gratuito para uso comercial**: la app tiene afiliados y
  Stripe, por lo que conviene tratarla como comercial → usar WeatherAPI.com o
  autoalojar Open-Meteo (AGPLv3).
- **Cerebras y Amazon Polly no son gratuitos permanentes**: son créditos con
  caducidad. No depender de ellos.
- **Proveedores ya muertos (no usar)**: GitHub Models (retirado jul 2026),
  Together AI (sin tier gratuito, mín. 15 $), Hugging Face Inference (sin
  créditos gratuitos desde oct 2026), Fireworks AI (sin créditos), DeepSeek
  (sin tier gratuito).
- **ElevenLabs free no permite uso comercial**.
- **OCR.space limita a 3 páginas PDF y 1 MB** por petición.
- **NHTSA vPIC solo cubre vehículos destinados a EE. UU.** (Europa parcial).
- **Wal33D dtc-database** está en inglés; habrá que traducir/curar descripciones.
- **Edge TTS y Google Translate TTS son no oficiales**: pueden romperse sin aviso.
- **Los tiers gratuitos cambian**: revisar cada 3 meses; el documento incluye
  fecha de verificación.
- **Pollinations** limita a 1 respuesta/45 s por IP: no apto para chat fluido.

---

## 11. Configuración de ejemplo

Ver `.env.example` (ampliado con las claves candidatas, todas comentadas).
Ninguna clave real se incluye en el repositorio.

---

*Verificado: noviembre de 2026. Fuentes: webs oficiales de cada proveedor,
documentación pública y comparativas independientes (gravity, aifree.dev,
branolabs, free.branolabs.com, etc.).*
