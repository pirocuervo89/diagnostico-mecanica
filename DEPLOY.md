# Publicar la web gratis (Render + GitHub)

Guía del despliegue real: URL pública con HTTPS y sin tarjeta. El repositorio ya
trae `Dockerfile`, `.dockerignore` y `render.yaml`, así que no hay que configurar
nada a mano en el panel.

## Paso 1 · Cuenta de GitHub

Hay que crearla desde el navegador: GitHub exige verificar el correo y resolver
un captcha, así que no se puede automatizar.

1. Abre <https://github.com/signup>.
2. Correo: el que uses para el proyecto.
3. Contraseña: la eliges ahí (mínimo 15 caracteres o 8 con número y minúscula).
4. Nombre de usuario sugerido: `diagnosticomecanica` o `selupiro`.
5. Verifica el código que llega al correo y elige el plan **Free**.

## Paso 2 · Repositorio vacío

1. <https://github.com/new>
2. Nombre: `diagnostico-mecanica`.
3. **Private** (el código es tuyo) y **sin** README, ni .gitignore, ni licencia.
4. Copia el nombre completo que aparece, tipo `usuario/diagnostico-mecanica`.

## Paso 3 · Subir el código

Desde la raíz del proyecto:

```bash
git remote add origin https://github.com/USUARIO/diagnostico-mecanica.git
git branch -M master
git push -u origin master
```

GitHub pedirá autenticación. La contraseña normal no vale: hay que crear un
*token* en <https://github.com/settings/tokens> → *Generate new token (classic)*
→ permisos `repo` → y usarlo como contraseña cuando `git push` la pida.

El repositorio pesa unos 200 MB por el histórico; la primera subida tarda unos
minutos. `backups/`, `node_modules/` y las claves `.env` están excluidos.

## Paso 4 · Crear el servicio en Render

1. Entra en <https://dashboard.render.com/register> y elige **GitHub** para
   registrarte (sin tarjeta).
2. Autoriza el acceso al repositorio `diagnostico-mecanica`.
3. *New* → **Blueprint** → selecciona el repositorio. Render lee `render.yaml`
   y crea el servicio solo.
4. Rellena las variables que pida (se pueden dejar vacías y añadir después):
   `PUBLIC_BASE_URL`, `AFFILIATE_TAG_AMAZON`, `AI_API_KEY`,
   `STRIPE_SECRET_KEY`.
5. Espera al despliegue (5–10 min la primera vez). La URL será
   `https://diagnostico-mecanica.onrender.com`.

Cuando la tengas, hay que ponerla en `data/legal.json` (`siteUrl`), en
`PUBLIC_BASE_URL` y regenerar las páginas legales con `npm run legal:build`.

## Variables de entorno

| Variable | Para qué | Obligatoria |
|---|---|---|
| `PUBLIC_BASE_URL` | Enlaces de Stripe, sitemap y canónicos | Sí, para cobrar |
| `AFFILIATE_TAG_AMAZON` | Añade `?tag=` a todos los enlaces de Amazon | Cuando la tengas |
| `AI_API_KEY` | Asistente y visión de testigos | Recomendada |
| `STRIPE_SECRET_KEY` | Venta del informe PRO | Para cobrar |
| `PRICE_SYNC` | Refresco automático de precios (`1`/`0`) | Ya viene en `1` |

## Límites del plan Free (importante)

- **Se duerme a los 15 minutos sin visitas.** La primera visita después tarda
  unos 50 segundos en despertar. Para la revisión de Amazon conviene entrar
  justo antes de enviar la solicitud.
- **Disco efímero:** en cada reinicio o despliegue se pierden el foro, las fotos
  del garaje y los pedidos. Los precios se regeneran solos.
- **512 MB de RAM:** el OCR de documentos y la visión cargan modelos; si el
  servicio se reinicia por memoria, la causa estará ahí.
- El refresco de precios solo avanza mientras el servicio está despierto; al
  despertar retoma por las fichas más antiguas.

Cuando haya visitas reales, la migración natural es Oracle Always Free o un VPS
barato: el mismo `Dockerfile` sirve, solo cambia dónde se ejecuta.

## Sin dormir: Oracle Cloud Always Free (gratis, siempre encendido)

Render Free se duerme a los 15 minutos. La migración ya está preparada
en `deploy/oracle/` (docker-compose con datos persistentes + Caddy con
HTTPS automático + scripts de instalación y actualización).

Guía completa en **`deploy/oracle/README.md`**:

```bash
# dentro de la VM de Oracle (Ubuntu 24.04)
git clone https://github.com/pirocuervo89/diagnostico-mecanica.git
cd diagnostico-mecanica
cp .env.example .env   # rellena tus claves
bash deploy/oracle/setup.sh
```

El alta en Oracle la hace el titular (identidad + tarjeta solo para
verificar, sin cargo en el plan Always Free). Al cambiar de servidor
hay que actualizar `PUBLIC_BASE_URL`, `data/legal.json` (`siteUrl` +
`npm run legal:build`), el webhook de Stripe, Search Console y
`SITE_URL` de IndexNow.

## Actualizar la web publicada

```bash
git add -A && git commit -m "cambios"
git push
```

Render redespliega solo con cada `push` a `master`.
