# Diagnóstico y Mecánica — preparación para Google Play

Estado: **web/PWA y APK firmado listos; falta la cuenta de Play Console y decidir el sistema de cobro dentro de la app.** La app se publica como TWA (Trusted Web Activity) y **vende lo mismo que la web**: planes e Informe PRO.

QA hecha: `npm test` 157/157; navegación atrás móvil sin bucle; APK 1.1 (`versionCode 2`) abre la web normal con el panel de pago; assetlinks verificado con la huella de la firma.

## 1. Decisiones de producto

- **La app es gratis de descargar, pero monetiza igual que la web**: planes de pago e Informe PRO al mismo precio. El objetivo es facturar en los dos canales, no regalar el PRO.
- **Distribución directa (APK/PWA)**: abre la web normal y cobra con **Stripe**, sin comisión de Google. Es el canal activo hoy y el que menos cuesta.
- **Google Play**: los pagos por contenido digital dentro de la app están regulados. Hay dos vías válidas:
  1. **Google Play Billing** para planes e informe, con verificación de compras en backend. Comisión: 10 % + 5 % de billing fee en suscripciones y 20 % + 5 % en pagos únicos (instalaciones nuevas, tramo estándar; 15 %/20 % con los programas de Google).
  2. **Programa *billing choice* de la UE** (disponible en el EEA desde el 30/06/2026): ofrecer Stripe dentro de la app **además** de Play Billing, con inscripción previa en Play Console y pago de la comisión de servicio (10 % suscripciones, 20 % pagos únicos en instalaciones nuevas). No exime de ofrecer Play Billing.
- Sin inscripción en esos programas, Play **prohíbe** dirigir al usuario a un pago externo (anti-steering). Por eso la build de Play no puede ser la misma que el APK directo.
- El modo `/?store=play` existe como base de una futura build de Play: oculta el panel Stripe mientras se integra el cobro permitido.
- Los productos de taller enlazan a **Amazon/Awin** (bienes físicos): eso sí puede usar enlaces externos sin restricción, con `rel="sponsored nofollow noopener noreferrer"`.

## 2. Ficha de Play Store

### Identidad

- **Nombre:** Diagnóstico y Mecánica
- **Nombre corto:** Diagnóstico
- **Package ID propuesto:** `com.diagnosticomecanica.app`
- **Categoría:** Vehículos y transporte (Auto & Vehicles)
- **Etiquetas:** diagnóstico, coche, OBD-II, DTC, mantenimiento, taller
- **Idioma principal:** Español (España)
- **Precio:** Gratis
- **Anuncios:** No
- **Compras integradas:** No
- **Email de soporte:** selupiro@gmail.com
- **Web:** https://diagnostico-mecanica.onrender.com
- **Política de privacidad:** https://diagnostico-mecanica.onrender.com/legal/privacidad.html
- **Eliminación de cuenta:** https://diagnostico-mecanica.onrender.com/legal/eliminar-cuenta.html

### Descripción corta (máx. 80)

`Diagnóstico de coche: síntomas, DTC, OBD-II, productos e informe técnico.`

### Descripción larga

```
Diagnóstico y Mecánica te ayuda a entender qué le pasa a tu coche antes de ir al taller.

SÍNTOMAS Y DIAGNÓSTICO GUIADO
Elige el síntoma (ruido, pérdida de potencia, testigo encendido, consumo alto, vibraciones...) y consulta las causas posibles, las comprobaciones básicas y el nivel de urgencia.

CÓDIGOS DTC
Busca códigos de avería OBD-II (P, B, C, U), consulta su significado, síntomas habituales y orientaciones de reparación.

LECTURA OBD-II
Conecta un adaptador ELM327 compatible por Bluetooth o USB y lee códigos y datos en tiempo real. También incluye un modo simulador para probar la app sin coche.

MANTENIMIENTO Y NEUMÁTICOS
Consulta intervalos de mantenimiento y equivalencias de neumáticos para preparar la revisión.

CATÁLOGO DE TALLER
Herramientas, líquidos, recambios y accesorios con enlaces a tiendas externas. Si compras desde esos enlaces, la app puede recibir una comisión de afiliado sin coste adicional para ti.

INFORME TÉCNICO
Genera un informe profesional con los datos del vehículo, síntomas, códigos DTC y espacio de firma. Guárdalo en PDF o imprímelo gratis desde el móvil.

COMUNIDAD Y ASISTENTE
Comparte dudas en el foro y usa el asistente técnico para orientarte. Las respuestas son orientativas y no sustituyen la inspección de un profesional.

PRIVACIDAD
Sin venta de datos. Puedes solicitar la eliminación de tu cuenta y datos desde la propia web. Consulta la política de privacidad y las condiciones de uso.

IMPORTANTE
La app ofrece orientación técnica. No garantiza un diagnóstico exacto ni sustituye la revisión presencial de un taller cualificado. Respeta las normas de tráfico y no manipules el vehículo con el motor en marcha si no estás seguro.
```

## 3. Recursos gráficos

| Recurso | Ruta | Formato |
|---|---|---|
| Icono Play (512×512) | `public/img/app/icon-512.png` | PNG 32 bits |
| Icono adaptativo/maskable | `public/img/app/icon-maskable-512.png` | PNG |
| Gráfico destacado | `public/img/store/feature-graphic-1024x500.png` | PNG 1024×500 |
| Captura inicio | `public/img/store/telefono-home.png` | PNG 720×1280 |
| Captura diagnóstico | `public/img/store/telefono-diagnostico.png` | PNG 720×1280 |
| Captura DTC | `public/img/store/telefono-dtc.png` | PNG 720×1280 |
| Captura productos | `public/img/store/telefono-productos.png` | PNG 720×1280 |
| Captura asistente | `public/img/store/telefono-chat.png` | PNG 720×1280 |
| Captura menú | `public/img/store/telefono-menu.png` | PNG 720×1280 |

Notas:
- Las capturas son 9:16, RGB, sin transparencia.
- **No subir `telefono-informe.png`** mientras Stripe esté en modo pruebas: muestra el sello «STRIPE · PRUEBAS». Sustituirla por una captura del informe gratuito o regenerarla cuando el cobro esté activo.
- Si `telefono-menu.png` sale con la pantalla de inicio, regenerarla en una ejecución separada del generador; el lote completo a veces la sobrescribe.
- El gráfico destacado debe mantener el texto dentro del 80 % central para evitar recortes.

## 4. App content (Play Console)

- **Política de privacidad:** URL de privacidad indicada arriba.
- **Eliminación de cuenta:** URL de eliminación indicada arriba. La página explica el proceso por email y los datos que se conservan por obligación legal. Pendiente: endpoint backend de borrado automático.
- **Clasificación de contenido:** completar el cuestionario. Hay contenido generado por usuarios (foro), sin violencia, sexo, drogas, apuestas ni lenguaje soez grave. Resultado probable: apto para mayores de 12/16 años. Público objetivo: **18+**, no dirigido a niños.
- **Anuncios:** No.
- **App de noticias:** No.
- **App de gobierno:** No.
- **Funciones financieras:** No.
- **Salud:** No.
- **Acceso a la app:** el diagnóstico, DTC, productos e informe gratuito funcionan sin cuenta. El foro/garaje requiere registro. Indicar en la ficha que las funciones principales son libres.
- **Permisos:** Internet; cámara/galería solo cuando el usuario adjunta una foto para el diagnóstico o el foro. No se pide ubicación, contactos, micrófono ni almacenamiento amplio.

## 5. Seguridad de los datos (Data safety)

Responder de forma coherente con la web:

- **Datos recopilados:**
  - Correo electrónico e identificadores de cuenta (registro/foro).
  - Contenido del usuario: mensajes del foro, fotos adjuntas y datos del vehículo introducidos en el informe.
  - Diagnósticos/errores: solo si se activa un servicio de crash reporting; hoy no hay SDK de crashes.
  - Registros del servidor: IP y páginas solicitadas para seguridad y funcionamiento.
- **Datos compartidos con terceros:**
  - Render (hosting), proveedor de IA para el chat si el usuario lo usa, Stripe solo en la web (no en la app de Play), Amazon/Awin al pulsar enlaces de afiliado.
  - No se venden datos.
- **Seguridad:** cifrado en tránsito (HTTPS); acceso restringido; los datos de tarjeta no pasan por la app.
- **Eliminación:** solicitud desde la web; borrado de cuenta y datos asociados, con conservación mínima legal.
- **Datos opcionales:** el correo es necesario para cuenta/foro; el resto de campos del informe son opcionales.

## 6. Empaquetado TWA

No hay Android SDK/Gradle instalado en este equipo. La vía recomendada es **Bubblewrap** o **PWABuilder** en una máquina con JDK 17 y Android SDK, o dejar que Freebuff lo haga. La PWA ya cumple: manifest, service worker, iconos, HTTPS y pantalla completa.

### Opción Bubblewrap (configuración ya preparada)

La configuración vive en `android/twa-manifest.json` (paquete, colores, iconos,
`startUrl: /`, pantalla completa y firma). Guía completa en
**`android/README.md`**. La build publicada como APK abre la web normal y cobra
con Stripe; para Play hay que crear una variante con Play Billing o inscribirse
en el programa de billing choice de la UE y cambiar el `startUrl` a
`/?store=play` mientras se integra.

```bash
npm run android:update   # genera el proyecto Gradle desde la configuración
npm run android:build    # firma app-release-signed.apk y app-release-bundle.aab
```

Genera `android/app-release-bundle.aab` (subir a Play) y
`android/app-release-signed.apk` (pruebas internas).

### Opción PWABuilder

1. Entrar en PWABuilder, pegar la URL de producción.
2. Elegir Android → Trusted Web Activity.
3. Package ID `com.diagnosticomecanica.app`; nombre y colores de arriba.
4. Descargar el paquete y firmarlo con la clave de subida.

### Firma

- Crear un keystore de subida y guardarlo fuera del repo (`*.jks` y contraseñas **no** se commitean).
- Activar **Play App Signing**.
- Anotar el SHA-256 de la clave de subida y el que muestra Play Console → App integrity.

### Digital Asset Links

El servidor ya publica `/.well-known/assetlinks.json` con el paquete
`com.diagnosticomecanica.app`. Solo falta darle la huella SHA-256: en Render →
*Environment*, añadir `ANDROID_SHA256_FINGERPRINT` (admite varias separadas por
comas: clave de subida y *App signing key* de Play Console).

```bash
curl -s https://diagnostico-mecanica.onrender.com/.well-known/assetlinks.json
```

Debe responder 200, `Content-Type: application/json` y la huella correcta. Sin
esto la TWA muestra barra de navegador y Play puede rechazarla.

## 7. Publicación

1. Crear la app en Play Console con el package ID definitivo.
2. Subir el AAB a **Pruebas internas**; probar en un Android real: instalación, apertura sin barra de navegador, diagnóstico, DTC, productos, foro, informe gratuito, atrás, rotación, modo avión/offline.
3. Completar **App content** (privacidad, eliminación de cuenta, data safety, clasificación, público, anuncios).
4. Subir icono, gráfico destacado y capturas; pegar textos.
5. Revisar que la build de Play no muestre el panel Stripe (`?store=play`).
6. Si la cuenta de Play es personal nueva: cumplir la prueba cerrada con **12 testers durante 14 días** antes de producción.
7. Pasar a producción y revisar la ficha publicada.

## 8. Bloqueos actuales

- No hay AAB firmado todavía (requiere JDK 17 + Android SDK).
- `assetlinks.json` ya está implementado en el servidor; falta añadir el SHA-256 real en Render.
- Falta el borrado real de cuenta en backend (la página legal explica el proceso por email).
- Stripe sigue en modo test: los cobros reales de planes e informe hay que activarlos con las claves Live antes de promocionar la venta.
- Para Play falta integrar Play Billing (o inscribirse en el programa EEA) y verificar compras en backend.
- Falta `GEMINI_API_KEY` en Render para el asistente en producción.
- Falta `AWIN_PUBLISHER_ID` para completar enlaces de afiliado de Autodoc.

## 9. Criterio para avisar al usuario de que está listo para subir

Se avisará cuando:
- El cobro dentro de la app esté resuelto: Stripe en el APK directo y Play Billing o billing choice en la build de Play.
- Stripe esté en modo Live con al menos una compra real verificada de punta a punta.
- El AAB esté firmado y subido a pruebas internas.
- `assetlinks.json` responda 200 con el SHA-256 correcto.
- Las capturas definitivas estén validadas (sin sello de pruebas).
- Data safety, privacidad y eliminación de cuenta estén completos en Play Console.
- La revisión interna en un Android real pase sin errores de consola ni pantallas rotas.
