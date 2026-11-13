import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Stripe from 'stripe';
import { PLANS, PLAN_ORDER, planState, planById } from '../lib/plans.js';
import { db, userFromSession } from '../lib/forum_db.js';

const SESSION_COOKIE = 'dym_forum_session';

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

function currentUser(req) {
  try { return userFromSession(cookieValue(req, SESSION_COOKIE)); } catch { return null; }
}

function savePlan(userId, plan, untilISO) {
  db.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?').run(plan, untilISO, userId);
}

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// Se leen en tiempo de petición: dotenv.config() se ejecuta después de evaluar
// los imports, así que los valores del .env aún no estarían disponibles aquí.
function ordersPath() {
  const custom = String(process.env.REPORT_ORDERS_PATH || '').trim();
  return custom ? path.resolve(custom) : path.join(DATA_DIR, 'orders.json');
}

function reportConfig() {
  const price = Number(process.env.REPORT_PRICE_CENTS || 990);
  return {
    currency: (process.env.REPORT_CURRENCY || 'eur').toLowerCase(),
    priceCents: Number.isFinite(price) ? Math.max(50, Math.round(price)) : 990,
    productName: process.env.REPORT_PRODUCT_NAME || 'Informe técnico PRO',
    webhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
  };
}

function readOrders() {
  try {
    const raw = fs.readFileSync(ordersPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  const target = ordersPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(orders.slice(-500), null, 1));
  fs.renameSync(tmp, target);
}

function stripeClient() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key || !/^sk_(test|live)_/.test(key)) return null;
  return new Stripe(key);
}

// El disco de Render Free es efímero: un pedido pagado se perdería en cada
// reinicio o despliegue. Por eso el derecho al informe viaja en un token
// firmado (HMAC), guardado también en los metadatos de la sesión de Stripe.
// Así el cliente puede descargar lo que ha pagado aunque el servidor se haya
// reiniciado entre el pago y la descarga.
function reportSecret() {
  return String(process.env.REPORT_TOKEN_SECRET || process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_SECRET_KEY || '').trim();
}

function signReport(payload) {
  const secret = reportSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyReportToken(token) {
  const secret = reportSecret();
  if (!secret || typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.v !== 1 || !payload.id || !payload.r) return null;
    return payload;
  } catch {
    return null;
  }
}

// Stripe limita cada valor de metadata a 500 caracteres: el token se reparte.
function tokenMetadata(token) {
  const chunks = [];
  for (let i = 0; i < token.length && chunks.length < 40; i += 460) {
    chunks.push(token.slice(i, i + 460));
  }
  return Object.fromEntries(chunks.map((chunk, index) => [`rt${index}`, chunk]));
}

function tokenFromSession(session) {
  const meta = session?.metadata || {};
  const chunks = [];
  for (let i = 0; meta[`rt${i}`]; i += 1) chunks.push(meta[`rt${i}`]);
  const token = chunks.join('');
  return token && verifyReportToken(token) ? token : null;
}

function markOrderPaid(orderId, sessionId) {
  const orders = readOrders();
  let changed = false;
  for (const order of orders) {
    const matches = (orderId && order.id === orderId) || (sessionId && order.sessionId === sessionId);
    if (matches && !order.paid) {
      order.paid = true;
      order.paidAt = new Date().toISOString();
      if (sessionId) order.sessionId = sessionId;
      changed = true;
    }
  }
  if (changed) writeOrders(orders);
  return orders.find(order => (orderId && order.id === orderId) || (sessionId && order.sessionId === sessionId)) || null;
}

// Límite sencillo en memoria: evita crear decenas de sesiones de Stripe desde una IP.
const checkoutHits = new Map();
function checkoutAllowed(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const hits = (checkoutHits.get(ip) || []).filter(at => now - at < windowMs);
  if (hits.length >= 12) {
    checkoutHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  checkoutHits.set(ip, hits);
  if (checkoutHits.size > 2000) checkoutHits.clear();
  return true;
}

function publicBase(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanReport(input) {
  const data = input && typeof input === 'object' ? input : {};
  const field = (key, max = 160) => String(data[key] ?? '').trim().slice(0, max);
  return {
    brand: field('brand', 60),
    model: field('model', 80),
    year: field('year', 6),
    engine: field('engine', 90),
    km: field('km', 20),
    dtc: field('dtc', 120),
    symptoms: field('symptoms', 1200)
  };
}

function money(cents, currency) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

function reportHtml(order) {
  const r = order.report || {};
  const date = new Date(order.paidAt || order.createdAt || Date.now()).toLocaleString('es-ES');
  const rows = [
    ['Marca', r.brand],
    ['Modelo', r.model],
    ['Año', r.year],
    ['Motorización', r.engine],
    ['Kilómetros', r.km],
    ['Códigos DTC', r.dtc || 'Sin códigos comunicados']
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || 'No indicado')}</td></tr>`).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Informe técnico · ${esc(order.id)}</title>
<style>
  body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0;padding:40px;background:#fff}
  h1{font-size:22px;margin:0 0 4px;letter-spacing:.02em}
  .meta{color:#555;font-size:12px;margin-bottom:26px}
  table{width:100%;border-collapse:collapse;margin:18px 0}
  th{text-align:left;width:34%;padding:8px 10px;background:#f3f4f6;border:1px solid #dcdfe4;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#333}
  td{padding:8px 10px;border:1px solid #dcdfe4}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin:26px 0 8px;color:#111}
  p{margin:0 0 10px}
  .box{border:1px solid #dcdfe4;padding:14px;background:#fafafa}
  .sign{display:flex;gap:40px;margin-top:46px}
  .sign div{flex:1;border-top:1px solid #999;padding-top:6px;font-size:12px;color:#444}
  .foot{margin-top:32px;font-size:11px;color:#666;border-top:1px solid #e5e7eb;padding-top:10px}
  @media print{body{padding:16mm}}
</style></head>
<body>
  <h1>Informe técnico de diagnóstico</h1>
  <div class="meta">Referencia ${esc(order.id)} · Emitido el ${esc(date)} · Documento verificado</div>
  <table>${rows}</table>
  <h2>Síntomas y observaciones</h2>
  <div class="box"><p>${esc(r.symptoms || 'Sin observaciones registradas.').replace(/\n/g, '<br>')}</p></div>
  <h2>Dictamen orientativo</h2>
  <p>El presente informe recoge los datos comunicados por el usuario y su correspondencia con la base técnica de la plataforma. Las causas indicadas deben confirmarse con mediciones físicas de taller (multímetro, parámetros OBD en vivo y comprobación mecánica del componente) antes de sustituir cualquier pieza.</p>
  <h2>Protocolo de verificación recomendado</h2>
  <ol>
    <li>Lectura de códigos DTC y parámetros en vivo con escáner OBD.</li>
    <li>Inspección visual del sistema afectado y de sus conexiones.</li>
    <li>Medición de alimentación, masas y señales con multímetro u osciloscopio.</li>
    <li>Confirmación de la causa mediante prueba física antes de cambiar piezas.</li>
    <li>Prueba final tras la reparación y borrado controlado de códigos.</li>
  </ol>
  <div class="sign"><div>Firma del técnico responsable</div><div>Firma del cliente</div></div>
  <div class="foot">Diagnóstico y Mecánica · Informe generado automáticamente a partir de los datos facilitados. No sustituye a una peritación oficial.</div>
</body></html>`;
}

router.get('/status', (req, res) => {
  // (planes: ver /api/payments/plans)
  const stripe = stripeClient();
  const key = String(process.env.STRIPE_SECRET_KEY || '');
  const config = reportConfig();
  const missing = [];
  if (!stripe) missing.push('STRIPE_SECRET_KEY');
  if (!config.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
  res.json({
    provider: 'stripe',
    configured: Boolean(stripe),
    webhookConfigured: Boolean(config.webhookSecret),
    mode: key.startsWith('sk_live') ? 'live' : key.startsWith('sk_test') ? 'test' : null,
    currency: config.currency,
    amount: config.priceCents,
    priceLabel: money(config.priceCents, config.currency),
    product: config.productName,
    missing,
    note: stripe
      ? (config.webhookSecret
        ? 'Pasarela lista: el cobro se realiza en Stripe Checkout y la confirmación llega por webhook y por la vuelta del pago.'
        : 'Pasarela lista para cobrar. Configura STRIPE_WEBHOOK_SECRET para confirmar los pagos aunque el cliente cierre el navegador.')
      : 'Falta la clave secreta de Stripe. Sin ella la compra permanece desactivada; el resto de la web funciona igual.'
  });
});

router.post('/checkout', async (req, res, next) => {
  try {
    const stripe = stripeClient();
    if (!stripe) {
      return res.status(503).json({
        error: 'La pasarela de pago no está configurada.',
        detail: 'Añade STRIPE_SECRET_KEY (sk_test_… o sk_live_…) al archivo .env y reinicia el servidor.',
        missing: ['STRIPE_SECRET_KEY']
      });
    }
    if (!checkoutAllowed(req.ip || 'desconocida')) {
      return res.status(429).json({ error: 'Demasiados intentos de compra. Espera unos minutos y vuelve a intentarlo.' });
    }
    const report = cleanReport(req.body?.report);
    if (!report.brand || !report.model) {
      return res.status(400).json({ error: 'Indica al menos marca y modelo para emitir el informe.' });
    }
    const config = reportConfig();

    const orderId = `INF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const token = signReport({ v: 1, id: orderId, r: report, iat: Date.now() });
    if (!token) {
      return res.status(503).json({
        error: 'El cobro no está configurado por completo.',
        detail: 'Falta STRIPE_WEBHOOK_SECRET (o REPORT_TOKEN_SECRET) para firmar el acceso al informe.',
        missing: ['STRIPE_WEBHOOK_SECRET']
      });
    }

    const order = {
      id: orderId,
      token,
      paid: false,
      createdAt: new Date().toISOString(),
      paidAt: null,
      amount: config.priceCents,
      currency: config.currency,
      email: String(req.body?.email || '').trim().slice(0, 120),
      report,
      sessionId: null
    };
    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);

    const base = publicBase(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.email || undefined,
      client_reference_id: order.id,
      metadata: { orderId: order.id, kind: 'informe-tecnico', ...tokenMetadata(token) },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: config.currency,
          unit_amount: config.priceCents,
          product_data: {
            name: config.productName,
            description: `${report.brand} ${report.model}${report.dtc ? ` · ${report.dtc}` : ''}`.slice(0, 240)
          }
        }
      }],
      success_url: `${base}/?pago=ok&session_id={CHECKOUT_SESSION_ID}#informe`,
      cancel_url: `${base}/?pago=cancelado#informe`
    });

    const updated = readOrders().map(o => (o.id === order.id ? { ...o, sessionId: session.id } : o));
    writeOrders(updated);
    res.json({ id: session.id, url: session.url, orderId: order.id });
  } catch (error) {
    next(error);
  }
});

router.get('/session/:id', async (req, res, next) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ error: 'La pasarela de pago no está configurada.' });
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    const paid = session.payment_status === 'paid';
    const order = paid
      ? markOrderPaid(session.client_reference_id, session.id)
      : (readOrders().find(o => o.sessionId === session.id) || readOrders().find(o => o.id === session.client_reference_id) || null);
    // El token de los metadatos sobrevive a reinicios del servidor; el pedido en
    // disco no. Sin esto, un cliente que paga y vuelve tras un despliegue se
    // encontraría con que su informe no existe.
    const token = order?.token || tokenFromSession(session);
    const config = reportConfig();
    res.json({
      id: session.id,
      paid,
      status: session.status,
      paymentStatus: session.payment_status,
      orderId: order?.id || session.client_reference_id || null,
      downloadUrl: paid && token ? `/api/payments/report/${token}` : null,
      product: config.productName,
      amount: order?.amount ?? config.priceCents,
      currency: order?.currency ?? config.currency
    });
  } catch (error) {
    next(error);
  }
});

// Prueba de 15 días: un informe gratis por IP y periodo. No regala productos
// (siguen siendo enlaces de compra), solo deja probar el valor del informe.
const trialSeen = new Map();
const TRIAL_MS = 15 * 24 * 60 * 60 * 1000;

router.post('/trial', (req, res) => {
  const report = cleanReport(req.body?.report);
  if (!report.brand || !report.model) {
    return res.status(400).json({ error: 'Indica al menos marca y modelo para generar el informe de prueba.' });
  }
  const secret = reportSecret();
  if (!secret) return res.status(503).json({ error: 'La prueba no está disponible ahora mismo.' });

  const ip = req.ip || 'desconocida';
  const now = Date.now();
  const previous = trialSeen.get(ip);
  if (previous && now - previous < TRIAL_MS) {
    const days = Math.ceil((TRIAL_MS - (now - previous)) / (24 * 60 * 60 * 1000));
    return res.status(429).json({ error: `La prueba de 15 días ya se usó en este dispositivo. Podrás repetirla en ${days} día(s) o comprar el informe completo.` });
  }
  if (trialSeen.size > 5000) trialSeen.clear();
  trialSeen.set(ip, now);

  const expiresAt = now + TRIAL_MS;
  const token = signReport({
    v: 1,
    id: `PRUEBA-${now.toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    r: report,
    iat: now,
    exp: expiresAt,
    trial: true
  });
  res.json({ downloadUrl: `/api/payments/report/${token}`, expiresAt: new Date(expiresAt).toISOString(), trial: true });
});

// Stripe firma el cuerpo sin procesar. server.js guarda req.rawBody en el
// parser JSON para poder verificar la firma sin cambiar el orden de los routers.
router.post('/webhook', (req, res) => {
  const stripe = stripeClient();
  const config = reportConfig();
  if (!stripe) return res.status(503).json({ error: 'Stripe no está configurado.' });
  if (!config.webhookSecret) return res.status(503).json({ error: 'Falta STRIPE_WEBHOOK_SECRET.' });
  const signature = req.headers['stripe-signature'];
  if (!signature || !req.rawBody) return res.status(400).json({ error: 'Firma de Stripe ausente.' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, config.webhookSecret);
  } catch (error) {
    return res.status(400).json({ error: `Firma no válida: ${error.message}` });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.mode === 'subscription') {
      // Alta de plan: se guarda un mes (Stripe renueva y avisa cada mes).
      const userId = Number(session.metadata?.userId || String(session.client_reference_id || '').replace('user:', ''));
      const plan = planById(session.metadata?.plan);
      if (Number.isInteger(userId) && userId > 0 && plan.id !== 'free') {
        const until = new Date(Date.now() + 31 * 86400000).toISOString();
        try { savePlan(userId, plan.id, until); } catch { /* la base manda */ }
      }
    } else if (session.payment_status === 'paid') {
      markOrderPaid(session.client_reference_id, session.id);
    }
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    const userId = Number(invoice.subscription_details?.metadata?.userId || 0);
    if (Number.isInteger(userId) && userId > 0) {
      try {
        const row = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
        if (row?.plan && row.plan !== 'free') {
          savePlan(userId, row.plan, new Date(Date.now() + 31 * 86400000).toISOString());
        }
      } catch { /* sin base no se puede renovar */ }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const userId = Number(event.data.object?.metadata?.userId || 0);
    if (Number.isInteger(userId) && userId > 0) {
      try { savePlan(userId, 'free', null); } catch { /* la base manda */ }
    }
  }

  res.json({ received: true });
});

router.get('/report/:token', (req, res) => {
  // El token firmado es la prueba de compra: no depende de que el pedido siga
  // en disco, así que el informe pagado se sirve también después de reinicios.
  const payload = verifyReportToken(req.params.token);
  if (!payload) {
    // Compatibilidad con pedidos antiguos: token aleatorio guardado en disco.
    // Sigue exigiendo pago y no abre la puerta a tokens inventados.
    const stored = readOrders().find(o => o.token === req.params.token);
    if (!stored) return res.status(404).json({ error: 'Informe no encontrado.' });
    if (!stored.paid) return res.status(402).json({ error: 'El informe aún no está pagado.' });
    return sendReport(res, stored);
  }
  if (payload.exp && Date.now() > payload.exp) {
    return res.status(410).json({ error: 'La prueba de 15 días ha caducado. Compra el informe para conservarlo.' });
  }
  sendReport(res, {
    id: payload.id,
    report: payload.r,
    createdAt: new Date(payload.iat || Date.now()).toISOString(),
    paidAt: null
  });
});

function sendReport(res, order) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Disposition', `inline; filename="informe-${order.id}.html"`);
  res.send(reportHtml(order));
}

// --------------------------------------------------------------- planes

router.get('/plans', (req, res) => {
  const user = currentUser(req);
  const state = planState(user);
  res.json({
    current: state.id,
    currentLabel: state.name,
    trialActive: state.trialActive,
    trialDaysLeft: state.trialDaysLeft,
    blocked: state.blocked,
    loggedIn: Boolean(user),
    plans: PLAN_ORDER.map(id => ({ ...PLANS[id], current: state.id === id }))
  });
});

// Alta o cambio de plan con Stripe Checkout en modo suscripción mensual.
router.post('/subscribe', async (req, res, next) => {
  try {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Entra en tu cuenta para contratar un plan.' });
    const planId = String(req.body?.plan || '').toLowerCase();
    const plan = PLANS[planId];
    if (!plan || plan.id === 'free') return res.status(400).json({ error: 'Plan no válido.' });

    const stripe = stripeClient();
    if (!stripe) {
      return res.status(503).json({
        error: 'Los cobros todavía no están activados.',
        detail: 'Añade STRIPE_SECRET_KEY en Render para poder contratar planes.'
      });
    }

    const base = String(process.env.PUBLIC_BASE_URL || 'https://diagnostico-mecanica.onrender.com').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: undefined,
      client_reference_id: `user:${user.id}`,
      metadata: { userId: String(user.id), plan: plan.id },
      subscription_data: { metadata: { userId: String(user.id), plan: plan.id } },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: plan.priceCents,
          recurring: { interval: 'month' },
          product_data: {
            name: `Diagnóstico y Mecánica · Plan ${plan.name}`,
            description: plan.features.slice(0, 2).join(' · ')
          }
        }
      }],
      success_url: `${base}/?plan=${plan.id}&pago=ok#planes`,
      cancel_url: `${base}/?pago=cancelado#planes`
    });
    res.json({ url: session.url, id: session.id });
  } catch (error) {
    next(error);
  }
});

export default router;
