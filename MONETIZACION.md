# Cobrar con la web: guía final

Web: https://diagnostico-mecanica.onrender.com
Panel propio (con el estado en vivo): `/panel-afiliados.html`
Comprobación automática: `node scripts/check-monetizacion.mjs`

La web ya está preparada. El dinero se configura en los paneles de
Amazon, Stripe y Awin, donde pones tu IBAN y tu identidad — eso solo lo
puedes hacer tú.

## Estado (verificado el 2026-11-08)

| Vía | Estado en la web | Falta para cobrar |
|---|---|---|
| Amazon Afiliados | ✅ Etiqueta `selupirootools-21` activa, 784 enlaces con comisión | IBAN + Tax Interview en afiliados.amazon.es |
| Stripe (informe PRO 9,90 €) | ⚠️ Configurado pero en **modo test** | Cuenta Live + IBAN en Stripe + claves Live en Render |
| Awin / Autodoc | ⚠️ Sin configurar | Publisher ID + IBAN en Awin (opcional) |

## 1. Amazon: que te transfieran las comisiones

1. Entra en https://afiliados.amazon.es
2. **Account → Payment Information**: país España, IBAN, titular.
3. Completa la **Tax Interview** (entrevista fiscal).
4. Revisa el mínimo de transferencia.

Sin IBAN y sin entrevista fiscal, Amazon no transfiere aunque vendas.
Las comisiones se confirman al cerrar el mes.

## 2. Stripe: cobrar el informe PRO de verdad

1. Entra en https://dashboard.stripe.com y cambia a modo **Live**
   (interruptor arriba a la izquierda).
2. **Settings → Payouts**: añade tu **IBAN** y completa la verificación
   de identidad (DNI/NIE, domicilio, alta como particular/autónomo).
   Stripe paga por SEPA en 2–5 días (comisión ~1,5 % + 0,25 € por cobro).
3. **Developers → API keys** (Live): copia la clave `sk_live_…`
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://diagnostico-mecanica.onrender.com/api/payments/webhook`
   - Evento: `checkout.session.completed`
   - Copia el secreto `whsec_…`
5. En Render → servicio → **Environment**, pon/actualiza:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PUBLIC_BASE_URL=https://diagnostico-mecanica.onrender.com
   AFFILIATE_TAG_AMAZON=selupirootools-21
   REPORT_PRICE_CENTS=990
   ```
6. Guarda: Render redespliega solo. Comprueba con
   `node scripts/check-monetizacion.mjs` — debe decir `modo LIVE`.

> Mientras la clave sea `sk_test_…` solo sirven tarjetas de prueba
> (`4242 4242 4242 4242`). No entra dinero real.

## 3. Awin / Autodoc (opcional)

1. Regístrate en https://ui.awin.com como publisher y solicita Autodoc
   (merchant 120163).
2. En Render añade `AWIN_PUBLISHER_ID=tu-numero`.
3. En Awin → **Payment Settings** añade tu IBAN.

## 4. Tráfico

Sin visitas no hay ventas: envía el sitemap en
https://search.google.com/search-console
(`https://diagnostico-mecanica.onrender.com/sitemap.xml`) y usa la plantilla
de contacto de `BACKLINKS.md` (un sitio, un correo).
