# App Android (Trusted Web Activity)

La web ya funciona como app instalable desde Chrome (PWA). Esta carpeta añade el
**contenedor Android nativo**: una Trusted Web Activity que abre exactamente la
misma web a pantalla completa, sin barra de direcciones y con el icono en el
cajón de aplicaciones. La web y la app comparten código: lo que despliegues en
Render aparece en las dos.

- Paquete: `com.diagnosticomecanica.app`
- Dominio: `diagnostico-mecanica.onrender.com`
- Configuración: [`twa-manifest.json`](./twa-manifest.json)

The build de Play abre `/?store=play`, el modo que oculta la compra con Stripe
(ver `PLAY-STORE.md`). La PWA instalada desde Chrome abre la web normal.

## Instalar la app ahora (sin compilar)

1. Abre <https://diagnostico-mecanica.onrender.com> en Chrome en el móvil.
2. Menú ⋮ → **Instalar aplicación** (o el botón *Instalar app* de la web).
3. Queda en el cajón de aplicaciones como cualquier otra app.

## Generar el APK / AAB

Requisitos: Node 22, JDK 17 y Android SDK. Bubblewrap ofrece descargarlos la
primera vez que lo ejecutas.

```bash
# 1) Clave de firma. Se crea UNA vez: guárdala y no la pierdas,
#    porque las actualizaciones de Play Store deben firmarse con la misma.
keytool -genkeypair -v \
  -keystore android/android.keystore \
  -alias android \
  -keyalg RSA -keysize 2048 -validity 10000

# 2) Generar el proyecto Android desde twa-manifest.json
npm run android:update

# 3) Compilar el APK y el AAB firmados
export BUBBLEWRAP_KEYSTORE_PASSWORD='tu-contraseña'
export BUBBLEWRAP_KEY_PASSWORD='tu-contraseña'
npm run android:build
```

Resultado dentro de `android/`:

- `app-release-signed.apk`: para probar en el móvil.
- `app-release-bundle.aab`: para subir a Google Play.

El proyecto Gradle generado también se puede abrir con Android Studio. No edites
a mano los archivos que genera Bubblewrap: se regeneran desde `twa-manifest.json`.

Para publicar una actualización, sube `appVersionCode` (2, 3, 4…) y
`appVersion` en `twa-manifest.json`, y repite `npm run android:update` y
`npm run android:build`.

## Verificación del dominio (quitar la barra de direcciones)

Android solo muestra la app a pantalla completa si el dominio publica la huella
SHA-256 de la firma en `/.well-known/assetlinks.json`. El servidor ya genera ese
archivo; solo hay que darle el valor.

```bash
# Huella del APK que acabas de firmar
keytool -list -v \
  -keystore android/android.keystore \
  -alias android \
  -storepass 'tu-contraseña' | grep -i SHA256
```

En Render → *Environment*:

| Variable | Valor |
|---|---|
| `ANDROID_PACKAGE_NAME` | `com.diagnosticomecanica.app` (opcional; es el valor por defecto) |
| `ANDROID_SHA256_FINGERPRINT` | La huella `AA:BB:…` del comando anterior |

Si usas **Play App Signing**, la huella que verifica Android es la de *App
signing key certificate* de Play Console, no la de tu keystore local. Puedes
poner las dos separadas por comas. Después de cambiar la variable, redespliega
y comprueba:

```bash
curl -s https://diagnostico-mecanica.onrender.com/.well-known/assetlinks.json
```

También se puede validar en
<https://developers.google.com/digital-asset-links/tools/generator>.

## Publicar en Google Play (opcional)

1. Cuenta de desarrollador (pago único de 25 USD) en <https://play.google.com/console>.
2. Crear app → subir `android/app-release-bundle.aab`.
3. Ficha: nombre, descripción, icono 512×512 (`public/img/app/icon-512.png`) y
   capturas de móvil (`public/img/store/`).
4. Formulario *Data safety* y política de privacidad:
   `https://diagnostico-mecanica.onrender.com/legal/privacidad.html`.
5. Enlace de eliminación de cuenta (obligatorio si hay cuentas):
   `https://diagnostico-mecanica.onrender.com/legal/eliminar-cuenta.html`.

## Si la app abre con barra de direcciones

- La huella de `assetlinks.json` no coincide con la firma del APK instalado.
- El archivo no se sirve como JSON (comprueba el `curl` anterior).
- La app se firmó con otra clave distinta de la que publicaste.

Mientras se corrige, la app sigue funcionando como pestaña personalizada de
Chrome (`fallbackType: customtabs`), así que nunca se queda en blanco.
