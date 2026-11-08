#!/usr/bin/env node
/**
 * Comprueba si la web está lista para cobrar, sin exponer secretos.
 * Uso: node scripts/check-monetizacion.mjs [baseUrl]
 * Por defecto usa https://diagnostico-mecanica.onrender.com
 */
const base = (process.argv[2] || 'https://diagnostico-mecanica.onrender.com').replace(/\/$/, '');

async function get(path) {
  const res = await fetch(base + path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
  return res.json();
}

let ok = true;
const mark = (good, label, detail = '') => {
  console.log(`${good ? '✅' : '⚠️ '} ${label}${detail ? ' — ' + detail : ''}`);
  if (!good) ok = false;
};

console.log(`\nMonetización · ${base}\n`);

try {
  const pay = await get('/api/payments/status');
  mark(pay.configured, 'Stripe configurado', pay.priceLabel || '');
  mark(pay.mode === 'live', 'Stripe en modo LIVE (dinero real)', pay.mode === 'test' ? 'ahora está en TEST: cambia a sk_live_… en Render' : `modo ${pay.mode}`);
  mark(pay.webhookConfigured, 'Webhook de Stripe', pay.webhookConfigured ? 'confirma pagos aunque cierren el navegador' : 'falta STRIPE_WEBHOOK_SECRET');
  if (pay.missing?.length) console.log(`   Faltan: ${pay.missing.join(', ')}`);
} catch (e) { mark(false, 'Stripe', e.message); }

try {
  const af = await get('/api/afiliados');
  mark(af.tagActive, 'Etiqueta Amazon activa', af.tagActive ? `${af.tag} · ${af.linkedItems} enlaces con comisión` : 'falta AFFILIATE_TAG_AMAZON');
  mark(Boolean(af.awinPublisher), 'Awin (Autodoc)', af.awinPublisher ? `publisher ${af.awinPublisher}` : 'sin configurar (opcional)');
} catch (e) { mark(false, 'Afiliados', e.message); }

console.log(`
Lo que NO se puede comprobar desde aquí (lo configuras tú en el panel de cada plataforma):
  1. Amazon Afiliados → Account → Payment: IBAN + Tax Interview
  2. Stripe → Settings → Payouts: IBAN + identidad, cuenta en modo Live
  3. Awin (opcional) → Payment Settings: IBAN

Panel propio: ${base}/panel-afiliados.html
`);
process.exit(ok ? 0 : 1);
