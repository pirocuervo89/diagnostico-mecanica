# Traspaso del proyecto

Estado a 10/11/2026. Este archivo existe para que otro agente pueda continuar sin
depender de la memoria de la conversación.

## Enlaces públicos

- Web: https://diagnostico-mecanica.onrender.com
- APK Android 1.1: https://diagnostico-mecanica.onrender.com/download/Diagnostico-Mecanica-1.1.apk
- APK alternativo: https://github.com/pirocuervo89/diagnostico-mecanica/raw/master/public/download/Diagnostico-Mecanica-1.1.apk
- Eliminación de cuenta: https://diagnostico-mecanica.onrender.com/legal/eliminar-cuenta.html
- `assetlinks`: https://diagnostico-mecanica.onrender.com/.well-known/assetlinks.json

## Estado técnico

- Rama `master`; Render despliega automáticamente desde GitHub. Es un plan free:
  el primer acceso tras inactividad puede tardar en despertar.
- `npm test` en verde: 158/158. QA de las 19 vistas en 390 y 1360, cookies,
  modal de cookies, atrás, menú móvil y `?store=play`: sin errores.
- APK 1.1 firmado (`versionCode 2`, `minSdk 24`, `targetSdk 36`) y verificado.
  Huella SHA-256: `2F:62:BC:B6:5B:DB:BB:A8:3E:FA:2B:F2:1E:07:45:2D:73:74:BC:51:DC:C2:9D:7A:0D:39:A6:DE:3A:DE:C1:73`.
- El APK abre la web normal, con Stripe visible. No es una build de Play Billing.
- El keystore y su contraseña están en `android/` pero ignorados por Git. Hay que
  conservar una copia privada; sin ellos no se pueden firmar actualizaciones.
- El AAB de Play está en `android/app-release-bundle.aab`, ignorado por Git.

## Pagos e IA

- Stripe está configurado en modo **test**. Para cobrar de verdad hacen falta
  `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` live en Render. No se pueden
  activar sin la cuenta del titular.
- La IA de producción no tiene clave (`/api/ai/status` → `configured:false`);
  funciona el motor experto local. Para IA real: `GROQ_API_KEY` o
  `GEMINI_API_KEY` en Render.
- Awin/Autodoc queda pendiente de `AWIN_PUBLISHER_ID`.

## Google Play (opcional)

- `PLAY-STORE.md` y `android/README.md` tienen la ficha y los pasos.
- Si se sube a Play, hay que añadir a `data/android.json` la huella SHA-256 de
  **Play App Signing**, no solo la de la clave de subida.
- El APK directo sirve para instalar sin Play; no requiere cuenta de desarrollador.

## Continuar

1. Leer `PLAY-STORE.md`, `android/README.md` y `.tmp/coordinacion-ia.md`.
2. No commitear `data/products.json` ni secretos/keystore.
3. `npm test` antes de cada push. El push a `master` dispara Render.
4. No se puede cambiar de agente ni saltar límites de plan/tokens de forma
   automática. Este traspaso deja el trabajo reproducible para que cualquier
   agente o persona continúe con las mismas instrucciones.
