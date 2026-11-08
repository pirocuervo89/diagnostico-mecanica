# Oracle Cloud Always Free: hosting gratis que no se duerme

Render Free se duerme a los 15 minutos. La única opción real **gratis
y siempre encendida** para este servidor Node/Docker es
**Oracle Cloud Always Free**.

> No existe hosting 100 % gratis, para siempre, sin dormir y sin
> tarjeta para una app con servidor. Oracle pide tarjeta **solo para
> verificar** (no cobra por el plan Always Free). Las alternativas
> sin tarjeta (Vercel, Netlify) son para webs estáticas y no sirven
> para este servidor Express. Render/Railway/Fly sin dormir cuestan
> dinero (~5–7 $/mes).

## Alta (solo tú puedes hacerla: identidad + tarjeta de verificación)

1. Entra en https://www.oracle.com/cloud/free/
2. **Start for free** → crea la cuenta (Cloud ID, correo, tarjeta para
   verificar, como todo proveedor serio).
3. Cuando entre, ve a **Compute → Instances → Create instance**:
   - Imagen: **Ubuntu 24.04** (ARM o AMD, da igual)
   - Shape: una de las **Always Free** (Ampere ARM 4 OCPU/24 GB o
     AMD 1 OCPU/1 GB). Si dice "out of capacity", prueba otra región
     (Frankfurt suele tener hueco) o reintenta más tarde.
   - SSH key: pega tu clave pública o genera una nueva.
   - Networking: deja la VCN que crea por defecto (abre 22, 80, 443).
4. Conecta por SSH:
   ```bash
   ssh -i tu-clave.key ubuntu@TU-IP
   ```

## Instalación (ya preparada en este repo)

```bash
git clone https://github.com/pirocuervo89/diagnostico-mecanica.git
cd diagnostico-mecanica
cp .env.example .env   # y rellena tus claves reales en .env
nano .env
bash deploy/oracle/setup.sh
```

`setup.sh` instala Docker, levanta la app con `docker compose`
(reinicio automático, datos en `data/` persistentes en el disco de la
VM) y Caddy con HTTPS automático.

## Dominio y HTTPS

1. En `deploy/oracle/Caddyfile` cambia `TU-DOMINIO` por tu dominio
   (o deja la IP y servirá HTTP).
2. Apunta el DNS de tu dominio (registro `A`) a la IP pública de la VM.
3. `docker compose -f deploy/oracle/docker-compose.yml up -d`
   Caddy saca y renueva solo el certificado Let's Encrypt.

## Al cambiar de servidor, recuerda actualizar

- `PUBLIC_BASE_URL` en el `.env` de la VM (y en Render si lo mantienes)
- `data/legal.json` → `siteUrl` y `npm run legal:build`
- Webhook de Stripe → nueva URL `/api/payments/webhook`
- Search Console → nueva propiedad + sitemap
- `SITE_URL` para `scripts/indexnow.mjs`

## Actualizar la web

```bash
bash deploy/oracle/update.sh
```

## Mientras tanto, en Render

El truco de "pinguear" la web cada 10 minutos (UptimeRobot gratis)
mantiene Render despierto en la práctica, pero no es un hosting de
verdad y puede fallar. Sirve como parche hasta migrar a Oracle.
