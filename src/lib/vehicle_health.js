const DAY = 86400000;

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseDate(value) {
  const time = Date.parse(`${String(value || '').slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function intervalKm(interval) {
  const match = String(interval || '').match(/([\d.]{3,})\s*(?:km|kil[oó]metros?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(value) && value > 500 ? value : null;
}

function intervalMonths(interval) {
  const source = fold(interval);
  const years = source.match(/(\d+)\s*a[nñ]os?/);
  if (years) return Number(years[1]) * 12;
  const months = source.match(/(\d+)\s*meses?/);
  if (months) return Number(months[1]);
  return null;
}

function statusLabel(score) {
  if (score >= 85) return { id: 'excelente', label: 'Excelente', tone: 'ok' };
  if (score >= 70) return { id: 'bien', label: 'Bien', tone: 'ok' };
  if (score >= 50) return { id: 'atencion', label: 'Necesita atención', tone: 'warn' };
  return { id: 'urgente', label: 'Revisar pronto', tone: 'bad' };
}

function latestByItem(events) {
  const map = new Map();
  for (const event of events) {
    if (event.kind !== 'mantenimiento' || !event.item) continue;
    if (!map.has(event.item)) map.set(event.item, event);
  }
  return map;
}

function maintenanceSystem(vehicle, latest, alerts) {
  let score = 100;
  const notes = [];
  const overdue = alerts.filter(alert => alert.level === 'vencido');
  const soon = alerts.filter(alert => alert.level === 'proximo');
  score -= overdue.length * 18;
  score -= soon.length * 6;
  if (overdue.length) notes.push(`${overdue.length} mantenimiento${overdue.length === 1 ? '' : 's'} vencido${overdue.length === 1 ? '' : 's'}`);
  if (soon.length) notes.push(`${soon.length} aviso${soon.length === 1 ? '' : 's'} próximo${soon.length === 1 ? '' : 's'}`);

  if (!vehicle.guide?.matched) {
    score -= 8;
    notes.push('Sin plan de mantenimiento documentado para este motor');
  }

  for (const item of vehicle.guide?.items || []) {
    const last = latest.get(item.key);
    const km = intervalKm(item.interval);
    const months = intervalMonths(item.interval);
    if (!last) {
      score -= 3;
      continue;
    }
    if (km && last.mileage && vehicle.mileage) {
      const since = vehicle.mileage - last.mileage;
      if (since > km) {
        score -= 16;
        notes.push(`${item.label}: ${since.toLocaleString('es-ES')} km desde el último cambio`);
      } else if (since > km * 0.85) {
        score -= 7;
      }
    }
    if (months && last.date) {
      const start = parseDate(last.date);
      if (start) {
        const due = start + months * 30 * DAY;
        if (Date.now() > due) {
          score -= 10;
          notes.push(`${item.label}: intervalo de tiempo superado`);
        } else if (Date.now() > due - 30 * DAY) {
          score -= 4;
        }
      }
    }
  }

  const unique = [...new Set(notes)];
  return {
    id: 'mantenimiento',
    label: 'Mantenimiento',
    score: clamp(score),
    weight: 30,
    detail: unique.length ? unique.slice(0, 2).join(' · ') : 'Sin avisos de mantenimiento pendientes'
  };
}

function issuesSystem(vehicle) {
  const issues = (vehicle.events || []).filter(event => ['averia', 'reparacion'].includes(event.kind));
  let score = 100;
  let recent = 0;
  for (const issue of issues) {
    const date = parseDate(issue.date);
    const isRecent = date && Date.now() - date < 365 * DAY;
    if (isRecent) recent += 1;
    score -= isRecent ? 8 : 2;
    if (issue.kind === 'averia' && !issue.cause) score -= 4;
  }
  score = clamp(score);
  const detail = !issues.length
    ? 'Sin averías registradas'
    : recent
      ? `${recent} avería${recent === 1 ? '' : 's'} en el último año`
      : `${issues.length} avería${issues.length === 1 ? '' : 's'} en el historial`;
  return { id: 'averias', label: 'Averías', score, weight: 25, detail };
}

function safetySystem(vehicle, alerts) {
  const critical = /freno|pastilla|disco|neum[aá]tic|amortiguador|suspensi|abs|esp|direcci/i;
  let score = 100;
  const relevant = alerts.filter(alert => critical.test(alert.label));
  if (!relevant.length) score = 78;
  for (const alert of relevant) score -= alert.level === 'vencido' ? 28 : 10;
  const lastBrakes = (vehicle.events || []).find(event => event.kind === 'mantenimiento' && event.item === 'frenos');
  const lastTyres = (vehicle.events || []).find(event => event.kind === 'mantenimiento' && event.item === 'neumaticos');
  if (lastBrakes && parseDate(lastBrakes.date) && Date.now() - parseDate(lastBrakes.date) > 2 * 365 * DAY) score -= 10;
  if (lastTyres && parseDate(lastTyres.date) && Date.now() - parseDate(lastTyres.date) > 5 * 365 * DAY) score -= 8;
  score = clamp(score);
  const detail = relevant.length
    ? `${relevant.length} aviso${relevant.length === 1 ? '' : 's'} de seguridad`
    : 'Sin avisos de frenos, neumáticos o suspensión';
  return { id: 'seguridad', label: 'Seguridad', score, weight: 20, detail };
}

function docsSystem(vehicle) {
  const docs = vehicle.documents || [];
  const kinds = new Set(docs.map(doc => doc.kind));
  let score = 100;
  const notes = [];
  if (!docs.length) {
    score -= 30;
    notes.push('Sin documentos guardados');
  }
  if (!kinds.has('ficha_tecnica')) { score -= 10; notes.push('Falta la ficha técnica'); }
  if (!kinds.has('factura')) { score -= 8; notes.push('Sin facturas guardadas'); }
  if (!vehicle.vin) { score -= 10; notes.push('Falta el VIN'); }
  if (!vehicle.firstRegistration) { score -= 6; notes.push('Falta la fecha de matriculación'); }
  if (!vehicle.plate) { score -= 5; notes.push('Falta la matrícula'); }
  return {
    id: 'documentacion',
    label: 'Documentación',
    score: clamp(score),
    weight: 15,
    detail: notes.length ? notes.slice(0, 2).join(' · ') : 'Ficha, facturas y datos completos'
  };
}

function historySystem(vehicle) {
  const events = vehicle.events || [];
  let score = 100;
  const notes = [];
  if (!events.length) { score -= 35; notes.push('Sin historial de mantenimiento'); }
  else if (events.length < 3) { score -= 12; notes.push('Historial todavía corto'); }
  if (!vehicle.mileage) { score -= 18; notes.push('Kilometraje sin actualizar'); }
  if (!vehicle.acquiredAt) { score -= 8; notes.push('Falta la fecha de compra'); }
  if (!(vehicle.documents || []).length) { score -= 8; }
  return {
    id: 'historial',
    label: 'Historial',
    score: clamp(score),
    weight: 10,
    detail: notes.length ? notes.slice(0, 2).join(' · ') : `${events.length} registros y kilometraje al día`
  };
}

function buildActions(vehicle, latest, systems) {
  const actions = [];
  const mileage = Number(vehicle.mileage || 0);

  for (const alert of vehicle.alerts || []) {
    actions.push({
      priority: alert.level === 'vencido' ? 'alta' : 'media',
      title: alert.label,
      detail: alert.detail,
      kind: 'aviso',
      url: '/#garaje'
    });
  }

  for (const item of vehicle.guide?.items || []) {
    const last = latest.get(item.key);
    if (!last) continue;
    const km = intervalKm(item.interval);
    const months = intervalMonths(item.interval);
    let reason = '';
    if (km && last.mileage && mileage) {
      const left = (last.mileage + km) - mileage;
      if (left > 0 && left <= 1000) reason = `quedan ${left.toLocaleString('es-ES')} km`;
    }
    if (months && last.date) {
      const start = parseDate(last.date);
      if (start) {
        const days = Math.ceil((start + months * 30 * DAY - Date.now()) / DAY);
        if (days > 0 && days <= 30) reason = `quedan ${days} día${days === 1 ? '' : 's'}`;
      }
    }
    if (reason) {
      actions.push({
        priority: 'media',
        title: item.label,
        detail: `Próximo cambio: ${reason} (${item.interval})`,
        kind: 'mantenimiento',
        url: '/#garaje'
      });
    }
  }

  if (!vehicle.vin || !vehicle.firstRegistration) {
    actions.push({
      priority: 'baja',
      title: 'Completa la ficha del coche',
      detail: 'Añade VIN y fecha de matriculación para afinar mantenimiento y campañas.',
      kind: 'datos',
      url: '/#garaje'
    });
  }
  if (!(vehicle.documents || []).some(doc => doc.kind === 'ficha_tecnica')) {
    actions.push({
      priority: 'baja',
      title: 'Guarda la ficha técnica',
      detail: 'Así podrás consultar la versión exacta y las medidas homologadas.',
      kind: 'documento',
      url: '/#garaje'
    });
  }
  if (systems.find(system => system.id === 'seguridad')?.score < 60) {
    actions.push({
      priority: 'alta',
      title: 'Revisa frenos, neumáticos o suspensión',
      detail: 'La puntuación de seguridad ha bajado. No esperes a notar una vibración o un frenazo largo.',
      kind: 'seguridad',
      url: '/#garaje'
    });
  }

  const order = { alta: 0, media: 1, baja: 2 };
  return actions
    .sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9))
    .slice(0, 8);
}

function buildTimeline(vehicle) {
  const rows = [];
  for (const event of vehicle.events || []) {
    rows.push({
      id: `event-${event.id}`,
      type: event.kind,
      typeLabel: event.kindLabel || event.kind,
      title: event.title,
      date: event.date,
      mileage: event.mileage,
      amount: event.cost,
      detail: [event.cause, event.parts, event.dtc].filter(Boolean).join(' · '),
      url: '/#garaje'
    });
  }
  for (const doc of vehicle.documents || []) {
    rows.push({
      id: `doc-${doc.id}`,
      type: 'documento',
      typeLabel: doc.kindLabel || 'Documento',
      title: doc.name,
      date: String(doc.createdAt || '').slice(0, 10),
      mileage: null,
      amount: null,
      detail: doc.mime || '',
      url: doc.url
    });
  }
  return rows
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 12);
}

export function buildVehicleHealth(vehicle) {
  if (!vehicle) throw Object.assign(new Error('Vehículo no encontrado.'), { status: 404 });
  const latest = latestByItem(vehicle.events || []);
  const alerts = vehicle.alerts || [];
  const systems = [
    maintenanceSystem(vehicle, latest, alerts),
    issuesSystem(vehicle),
    safetySystem(vehicle, alerts),
    docsSystem(vehicle),
    historySystem(vehicle)
  ];
  const weight = systems.reduce((sum, system) => sum + system.weight, 0);
  const overall = clamp(systems.reduce((sum, system) => sum + system.score * system.weight, 0) / weight);
  const status = statusLabel(overall);
  const actions = buildActions(vehicle, latest, systems);

  return {
    ok: true,
    vehicle: {
      id: vehicle.id,
      name: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' '),
      plate: vehicle.plate || '',
      mileage: vehicle.mileage || 0,
      year: vehicle.year || null,
      fuel: vehicle.fuel || ''
    },
    score: overall,
    status,
    systems,
    alerts,
    actions,
    timeline: buildTimeline(vehicle),
    stats: {
      events: (vehicle.events || []).length,
      documents: (vehicle.documents || []).length,
      spentTotal: vehicle.stats?.spentTotal || 0,
      spentThisYear: vehicle.stats?.spentThisYear || 0
    },
    nextService: (vehicle.guide?.items || []).slice(0, 6),
    guideMatched: Boolean(vehicle.guide?.matched),
    disclaimer: 'Puntuación orientativa construida con los datos que has registrado. No sustituye una revisión física, una ITV ni el plan de mantenimiento oficial del fabricante.'
  };
}

export { intervalKm, intervalMonths, statusLabel };
