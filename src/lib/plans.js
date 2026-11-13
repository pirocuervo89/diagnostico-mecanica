// Planes de la app y de la web.
//
//   free  → 30 días de prueba, 1 coche, respuestas básicas.
//   pro   → 4,99 €/mes, 2 coches, respuestas buenas pero sin el paso a paso
//           completo (ahí se empuja al Full).
//   full  → 9,99 €/mes, 10 coches, respuestas completas y prioridad.
//
// El plan del usuario vive en la tabla users (columnas plan, plan_expires_at y
// trial_ends_at). Sin login se considera invitado con lo justo para probar.

export const TRIAL_DAYS = 30;

export const PLANS = {
  free: {
    id: 'free',
    name: 'Gratis',
    priceCents: 0,
    priceLabel: '0 €',
    period: '30 días de prueba',
    vehicles: 1,
    aiWords: 220,
    aiLevel: 'básico',
    tagline: 'Para probarlo sin pagar nada',
    features: [
      'Diagnóstico por síntoma y por código DTC',
      '1 coche en Mi garaje',
      'Asistente IA en modo básico',
      'Tienda completa con precios y ofertas',
      '30 días de prueba: después hace falta un plan'
    ],
    missing: ['10 coches en el garaje', 'Respuestas completas y prioridad']
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 499,
    priceLabel: '4,99 €',
    period: 'al mes',
    vehicles: 2,
    aiWords: 300,
    aiLevel: 'alto',
    tagline: 'Para el que tiene un par de coches',
    features: [
      'Todo lo del plan Gratis, sin caducidad',
      '2 coches en Mi garaje',
      'Respuestas detalladas del asistente IA',
      'Historial de averías y facturas ilimitado'
    ],
    missing: ['Hasta 10 coches', 'Paso a paso completo, con valores y conectores', 'Prioridad cuando hay mucha gente']
  },
  full: {
    id: 'full',
    name: 'Full',
    priceCents: 999,
    priceLabel: '9,99 €',
    period: 'al mes',
    vehicles: 10,
    aiWords: 500,
    aiLevel: 'máximo',
    tagline: 'Taller o familia con varios coches',
    features: [
      'Todo lo del plan Pro',
      'Hasta 10 coches en Mi garaje',
      'Respuestas completas, con todas las comprobaciones',
      'Prioridad cuando hay mucha gente',
      'Acceso anticipado a las secciones nuevas'
    ],
    missing: []
  }
};

export const PLAN_ORDER = ['free', 'pro', 'full'];

export function planById(id) {
  return PLANS[String(id || '').toLowerCase()] || PLANS.free;
}

const nowMs = () => Date.now();
const time = value => {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Plan efectivo de un usuario (o de un invitado).
 * Devuelve el plan, si sigue en prueba, si el plan de pago ha caducado y si el
 * acceso está bloqueado (prueba terminada sin plan de pago).
 */
export function planState(user) {
  if (!user) {
    return {
      ...PLANS.free,
      isGuest: true,
      trialActive: false,
      trialDaysLeft: 0,
      expired: false,
      blocked: false
    };
  }
  const plan = planById(user.plan);
  const trialEnds = time(user.trial_ends_at ?? user.trialEndsAt);
  const planEnds = time(user.plan_expires_at ?? user.planExpiresAt);
  const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds - nowMs()) / 86400000)) : 0;

  // Plan de pago vigente.
  if (plan.id !== 'free' && (!planEnds || planEnds > nowMs())) {
    return {
      ...plan,
      isGuest: false,
      trialActive: false,
      trialDaysLeft: 0,
      expired: false,
      blocked: false
    };
  }

  // Plan de pago caducado: vuelve al gratuito y, si la prueba ya pasó, se bloquea.
  const trialActive = Boolean(trialEnds) && trialEnds > nowMs();
  const expired = plan.id !== 'free';
  return {
    ...PLANS.free,
    isGuest: false,
    trialActive,
    trialDaysLeft,
    expired,
    // Las cuentas antiguas sin fecha de prueba siguen funcionando: no se les
    // corta el acceso por sorpresa.
    blocked: Boolean(trialEnds) && !trialActive
  };
}

export function vehiclesAllowed(user) {
  return planState(user).vehicles;
}
