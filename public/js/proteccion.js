(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { quote: null, triage: null, user: null, vehicles: [], healthLoaded: false };
  const moneyFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const numFmt = new Intl.NumberFormat('es-ES');

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : moneyFmt.format(Number(value));
  }

  function num(value) {
    return value == null || !Number.isFinite(Number(value)) ? '—' : numFmt.format(Number(value));
  }

  function dateFmt(value) {
    if (!value) return 'Sin fecha';
    const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function toast(message) {
    const el = $('#prToast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Error ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function showStatus(el, message, kind = '') {
    el.hidden = !message;
    el.textContent = message || '';
    el.className = `pr-status${kind ? ` ${kind}` : ''}`;
  }

  function differencePercent(total, range) {
    if (total == null || !range || !range.mid) return null;
    return Math.round(((total - range.mid) / range.mid) * 100);
  }

  function rangePosition(total, range) {
    if (total == null || !range) return 50;
    const span = range.max - range.min || 1;
    return Math.max(0, Math.min(100, ((total - range.min) / span) * 100));
  }

  function bindTabs() {
    const tabs = $$('.pr-tab');
    const panels = $$('.pr-panel');
    const activate = (name, updateHash = true) => {
      tabs.forEach(tab => {
        const active = tab.dataset.prTab === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      panels.forEach(panel => {
        const active = panel.id === `tab${name[0].toUpperCase()}${name.slice(1)}`;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
      if (updateHash) history.replaceState(null, '', `#${name === 'quote' ? 'presupuesto' : name === 'health' ? 'salud' : 'triaje'}`);
      if (name === 'health' && state.user && !state.healthLoaded) loadVehicles();
    };
    tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.prTab)));
    const name = location.hash.replace('#', '');
    if (name === 'salud') activate('health', false);
    else if (name === 'triaje') activate('triage', false);
    else activate('quote', false);
  }

  function setBusy(button, busy, text) {
    if (!button) return;
    if (busy) {
      button.dataset.original = button.textContent;
      button.textContent = text || 'Analizando…';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.original || button.textContent;
      button.disabled = false;
    }
  }

  function waLink(text) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  async function shareText(text, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title: title || 'Diagnóstico y Mecánica', text });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Texto copiado. Ya puedes pegarlo donde quieras.');
    } catch {
      toast('No se ha podido copiar automáticamente.');
    }
  }

  function statusClass(value) {
    if (value === 'alto' || value === 'muy_alto' || value === 'bad' || value === 'rojo') return 'bad';
    if (value === 'warn' || value === 'ambar' || value === 'revisar' || value === 'algo') return 'warn';
    if (value === 'ok' || value === 'verde' || value === 'bueno' || value === 'justo') return 'ok';
    return 'neutral';
  }

  function itemStatusLabel(status) {
    const labels = {
      alto: 'Por encima del rango',
      en_rango: 'En rango',
      bajo: 'Muy bajo',
      sin_referencia: 'Sin referencia',
      mano_de_obra: 'Mano de obra'
    };
    return labels[status] || 'Revisar';
  }

  function renderQuote(data) {
    const result = $('#quoteResult');
    const review = data.review;
    const parsed = review.parsed;
    const verdict = review.verdict;
    const tone = statusClass(verdict.tone);
    const diff = differencePercent(parsed.total, parsed.marketRange);
    const ring = diff == null ? 50 : Math.max(5, Math.min(95, 50 - diff));
    const marker = rangePosition(parsed.total, parsed.marketRange);
    const savings = review.savings ? `<div class="pr-kpi"><span>Posible ahorro</span><b>${esc(money(review.savings))}</b><small>frente al extremo alto</small></div>` : '';
    const rangeBlock = parsed.marketRange ? `
      <div class="pr-range">
        <div class="pr-range-track"><i class="pr-range-marker" style="left:${marker.toFixed(1)}%"></i></div>
        <div class="pr-range-labels"><span>${esc(money(parsed.marketRange.min))}</span><span>Rango orientativo</span><span>${esc(money(parsed.marketRange.max))}</span></div>
      </div>` : '';
    const flags = review.flags.length ? `
      <div class="pr-block"><h4>Señales que revisar</h4><div class="pr-flags-list">
        ${review.flags.map(flag => `<div class="pr-flag ${statusClass(flag.level)}"><i></i><div><b>${esc(flag.title)}</b><small>${esc(flag.detail)}</small></div></div>`).join('')}
      </div></div>` : '';
    const items = parsed.items.length ? `
      <div class="pr-block"><h4>Líneas detectadas</h4><div class="pr-table-wrap"><table class="pr-table">
        <thead><tr><th>Concepto</th><th>Importe</th><th>Lectura</th></tr></thead>
        <tbody>${parsed.items.map(item => `<tr>
          <td>${esc(item.description)}${item.benchmark ? `<br><small>${esc(item.benchmark.label)}</small>` : ''}</td>
          <td>${esc(money(item.amount))}</td>
          <td class="${esc(item.status)}">${esc(itemStatusLabel(item.status))}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>` : '';
    const operations = parsed.operations.length ? `
      <div class="pr-block"><h4>Operaciones reconocidas</h4><div class="pr-flags-list">
        ${parsed.operations.map(op => `<div class="pr-flag"><i></i><div><b>${esc(op.label)}</b><small>${esc(op.note)}</small></div></div>`).join('')}
      </div></div>` : '';
    const questions = `
      <div class="pr-block"><h4>Preguntas antes de firmar</h4><ol class="pr-list">${review.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>`;
    const metaNote = data.meta?.method === 'ocr' || data.meta?.ocr
      ? `<p class="pr-note">Texto leído con OCR${data.meta.pages ? ` (${data.meta.pages} página${data.meta.pages === 1 ? '' : 's'})` : ''}. Si alguna cifra no coincide, corrige el texto y vuelve a analizar.</p>`
      : '';

    result.hidden = false;
    result.innerHTML = `
      <div class="pr-verdict">
        <div class="pr-verdict-score" style="--p:${ring};--tone:${tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--accent)' : 'var(--ok)'}">
          <div><b>${diff == null ? '?' : `${diff > 0 ? '+' : ''}${diff}%`}</b><small>vs. centro</small></div>
        </div>
        <div>
          <span class="pr-pill ${tone}">${esc(verdict.label)}</span>
          <h3>${parsed.total ? esc(money(parsed.total)) : 'Total no detectado'}</h3>
          <p>${esc(review.summary)}</p>
        </div>
      </div>
      <div class="pr-kpis">
        <div class="pr-kpi"><span>Total</span><b>${esc(parsed.total ? money(parsed.total) : '—')}</b><small>${parsed.ivaIncluded ? 'IVA incluido' : parsed.ivaMissing ? 'IVA no visible' : 'IVA desglosado'}</small></div>
        <div class="pr-kpi"><span>Rango de mercado</span><b>${parsed.marketRange ? `${esc(money(parsed.marketRange.min))} – ${esc(money(parsed.marketRange.max))}` : '—'}</b><small>${parsed.operations.length} ${parsed.operations.length === 1 ? 'operación' : 'operaciones'} reconocida${parsed.operations.length === 1 ? '' : 's'}</small></div>
        <div class="pr-kpi"><span>Mano de obra</span><b>${parsed.labourRate ? `${esc(money(parsed.labourRate))}/h` : parsed.labourAmount ? esc(money(parsed.labourAmount)) : '—'}</b><small>${parsed.hours ? `${parsed.hours} h detectadas` : 'sin horas claras'}</small></div>
        ${savings}
      </div>
      ${rangeBlock}
      <div class="pr-grid-2">
        <div>${flags}${operations}</div>
        <div>${questions}<div class="pr-block"><h4>Que quede claro</h4><p class="pr-note">${esc(review.disclaimer)}</p></div></div>
      </div>
      ${items}
      <div class="pr-actions">
        <a class="pr-btn primary" href="${esc(waLink(review.whatsapp))}" target="_blank" rel="noopener">Enviar dudas por WhatsApp</a>
        <button class="pr-btn cyan" type="button" id="quoteShare">Compartir resultado</button>
        <button class="pr-btn ghost" type="button" id="quotePrint">Imprimir / guardar PDF</button>
      </div>
      ${metaNote}
    `;
    $('#quoteShare')?.addEventListener('click', () => shareText(review.whatsapp, 'Segunda opinión de presupuesto'));
    $('#quotePrint')?.addEventListener('click', () => window.print());
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function quoteFileData(file) {
    if (!file) return { dataUrl: '', mimeType: '' };
    if (file.size > 8 * 1024 * 1024) throw new Error('El archivo supera los 8 MB. Usa una foto más ligera o un PDF menor.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
      reader.readAsDataURL(file);
    });
    return { dataUrl, mimeType: file.type || '' };
  }

  function bindQuote() {
    const form = $('#quoteForm');
    const fileInput = $('#quoteFile');
    const status = $('#quoteStatus');
    const result = $('#quoteResult');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      const label = $('#quoteFileState');
      if (!file) {
        label.textContent = 'También puedes escribir solo las líneas que te interesan.';
        label.classList.remove('ok');
        return;
      }
      const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      label.textContent = `${file.name} · ${size}`;
      label.classList.add('ok');
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#quoteSubmit');
      const text = $('#quoteText').value.trim();
      const file = fileInput.files?.[0];
      if (!text && !file) {
        showStatus(status, 'Escribe el presupuesto o adjunta una foto o PDF.', 'error');
        return;
      }
      setBusy(button, true, 'Revisando…');
      showStatus(status, '');
      result.hidden = true;
      try {
        const fileData = await quoteFileData(file);
        const data = await api('/api/proteccion/presupuesto', {
          method: 'POST',
          body: JSON.stringify({
            text: text || undefined,
            dataUrl: fileData.dataUrl || undefined,
            mimeType: fileData.mimeType || undefined,
            vehicleId: $('#quoteVehicle').value || undefined
          })
        });
        state.quote = data;
        renderQuote(data);
        if (!text && file) showStatus(status, 'Documento leído. Revisa que las cifras detectadas coincidan con el original.', 'ok');
      } catch (error) {
        showStatus(status, error.message, 'error');
      } finally {
        setBusy(button, false);
      }
    });

    $('#quoteClear').addEventListener('click', () => {
      form.reset();
      fileInput.value = '';
      $('#quoteFileState').textContent = 'También puedes escribir solo las líneas que te interesan.';
      $('#quoteFileState').classList.remove('ok');
      result.hidden = true;
      result.innerHTML = '';
      showStatus(status, '');
    });
  }

  function populateVehicleSelect(select, vehicles, placeholder) {
    const current = select.value;
    select.innerHTML = `<option value="">${esc(placeholder)}</option>` + vehicles.map(vehicle => {
      const name = [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' ');
      return `<option value="${vehicle.id}">${esc(name)}${vehicle.plate ? ` · ${esc(vehicle.plate)}` : ''}</option>`;
    }).join('');
    if (vehicles.some(vehicle => String(vehicle.id) === current)) select.value = current;
  }

  async function loadSession() {
    try {
      const data = await api('/api/forum/auth/me');
      state.user = data.user || null;
    } catch {
      state.user = null;
    }
    $('#healthLoading').hidden = true;
    $('#healthAuth').hidden = Boolean(state.user);
    $('#healthApp').hidden = !state.user;
    if (state.user) await loadVehicles();
  }

  function bindAuth() {
    const loginForm = $('#healthLoginForm');
    const registerForm = $('#healthRegisterForm');
    const message = $('#healthAuthMsg');
    const finish = async (user) => {
      state.user = user;
      message.hidden = true;
      $('#healthAuth').hidden = true;
      $('#healthApp').hidden = false;
      $('#healthLoading').hidden = true;
      await loadVehicles();
    };
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = loginForm.querySelector('button');
      setBusy(button, true, 'Entrando…');
      try {
        const data = await api('/api/forum/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: $('#healthLoginUser').value.trim(), password: $('#healthLoginPass').value })
        });
        await finish(data.user);
      } catch (error) {
        message.hidden = false;
        message.className = 'pr-msg error';
        message.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    });
    registerForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = registerForm.querySelector('button');
      setBusy(button, true, 'Creando…');
      try {
        const data = await api('/api/forum/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            username: $('#healthRegUser').value.trim(),
            displayName: $('#healthRegName').value.trim() || undefined,
            password: $('#healthRegPass').value
          })
        });
        await finish(data.user);
      } catch (error) {
        message.hidden = false;
        message.className = 'pr-msg error';
        message.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    });
  }

  async function loadVehicles() {
    try {
      const data = await api('/api/garage/vehicles');
      state.vehicles = data.vehicles || [];
      populateVehicleSelect($('#quoteVehicle'), state.vehicles, 'Sin coche seleccionado');
      populateVehicleSelect($('#healthVehicle'), state.vehicles, 'Elige un coche');
      state.healthLoaded = true;
      $('#healthLoading').hidden = true;
      $('#healthEmpty').hidden = state.vehicles.length > 0;
      $('#healthResult').innerHTML = '';
      if (!state.vehicles.length) return;
      await loadHealth(state.vehicles[0].id);
    } catch (error) {
      if (error.status === 401) {
        state.user = null;
        state.healthLoaded = false;
        $('#healthAuth').hidden = false;
        $('#healthApp').hidden = true;
        return;
      }
      $('#healthLoading').hidden = false;
      showStatus($('#healthLoading'), error.message, 'error');
    }
  }

  function renderHealth(data) {
    const result = $('#healthResult');
    const tone = statusClass(data.status?.tone || data.status?.id);
    const systems = (data.systems || []).map(system => {
      const cls = system.score < 55 ? 'low' : system.score < 75 ? 'mid' : '';
      return `<div class="pr-system"><span>${esc(system.label)}</span><div class="pr-bar ${cls}"><i style="width:${Math.max(2, Math.min(100, system.score))}%"></i></div><b>${system.score}</b></div>`;
    }).join('');
    const actions = (data.actions || []).length ? `
      <div class="pr-block"><h4>Qué haría ahora</h4><div class="pr-flags-list">
        ${data.actions.map(action => `<div class="pr-flag ${action.priority === 'alta' ? 'bad' : action.priority === 'media' ? 'warn' : ''}"><i></i><div><b>${esc(action.title)}</b><small>${esc(action.detail)}</small></div></div>`).join('')}
      </div></div>` : '';
    const next = (data.nextService || []).length ? `
      <div class="pr-block"><h4>Próximos mantenimientos</h4><div class="pr-table-wrap"><table class="pr-table">
        <thead><tr><th>Elemento</th><th>Intervalo</th></tr></thead>
        <tbody>${data.nextService.map(item => `<tr><td>${esc(item.label)}</td><td>${esc(item.interval || '—')}</td></tr>`).join('')}</tbody>
      </table></div></div>` : '';
    const timeline = (data.timeline || []).length ? `
      <div class="pr-block"><h4>Historial vivo</h4><ul class="pr-timeline">
        ${data.timeline.map(row => `<li><b>${esc(row.title)}</b><small>${esc(row.typeLabel)} · ${esc(dateFmt(row.date))}${row.mileage ? ` · ${esc(num(row.mileage))} km` : ''}${row.amount ? ` · ${esc(money(row.amount))}` : ''}</small>${row.detail ? `<small class="pr-timeline-meta">${esc(row.detail)}</small>` : ''}</li>`).join('')}
      </ul></div>` : '';

    result.innerHTML = `
      <div class="pr-verdict">
        <div class="pr-verdict-score" style="--p:${data.score};--tone:${tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--accent)' : 'var(--ok)'}">
          <div><b>${data.score}</b><small>de 100</small></div>
        </div>
        <div>
          <span class="pr-pill ${tone}">${esc(data.status?.label || 'Salud orientativa')}</span>
          <h3>${esc(data.vehicle?.name || 'Tu coche')}</h3>
          <p>${esc(data.vehicle?.plate || 'Sin matrícula')}${data.vehicle?.mileage ? ` · ${esc(num(data.vehicle.mileage))} km` : ''}${data.vehicle?.year ? ` · ${data.vehicle.year}` : ''}. Puntuación construida con lo que has registrado en Mi garaje.</p>
        </div>
      </div>
      <div class="pr-kpis">
        <div class="pr-kpi"><span>Gasto total</span><b>${esc(money(data.stats?.spentTotal))}</b><small>en el historial</small></div>
        <div class="pr-kpi"><span>Este año</span><b>${esc(money(data.stats?.spentThisYear))}</b><small>mantenimiento y averías</small></div>
        <div class="pr-kpi"><span>Registros</span><b>${num(data.stats?.events)}</b><small>${num(data.stats?.documents)} documentos</small></div>
        <div class="pr-kpi"><span>Plan del motor</span><b>${data.guideMatched ? 'Confirmado' : 'Estimado'}</b><small>${data.guideMatched ? 'por código de motor' : 'por motorización equivalente'}</small></div>
      </div>
      <div class="pr-block"><h4>Salud por sistema</h4><div class="pr-systems">${systems}</div></div>
      ${actions}
      <div class="pr-grid-2">${next}<div>${timeline}</div></div>
      <div class="pr-block"><h4>Que quede claro</h4><p class="pr-note">${esc(data.disclaimer)}</p></div>
      <div class="pr-actions">
        <a class="pr-btn primary" href="/#garaje">Completar en Mi garaje</a>
        <button class="pr-btn ghost" type="button" id="healthPrint">Imprimir / guardar PDF</button>
      </div>
    `;
    $('#healthPrint')?.addEventListener('click', () => window.print());
  }

  async function loadHealth(id) {
    if (!id) return;
    const loading = $('#healthLoading');
    try {
      loading.hidden = false;
      showStatus(loading, 'Calculando salud del coche…');
      const data = await api(`/api/proteccion/salud/${encodeURIComponent(id)}`);
      loading.hidden = true;
      renderHealth(data);
    } catch (error) {
      showStatus(loading, error.message, 'error');
    }
  }

  function bindHealth() {
    $('#healthVehicle').addEventListener('change', event => loadHealth(event.target.value));
    $('#healthRefresh').addEventListener('click', async () => {
      const button = $('#healthRefresh');
      setBusy(button, true, 'Actualizando…');
      try {
        await loadVehicles();
      } finally {
        setBusy(button, false);
      }
    });
  }

  function renderTriage(data) {
    const result = $('#triageResult');
    const tone = statusClass(data.tone);
    const symptoms = (data.symptoms || []).length ? `
      <div class="pr-block"><h4>Coincidencias con la base</h4><div class="pr-flags-list">
        ${data.symptoms.map(symptom => `<div class="pr-flag ${statusClass(symptom.urgency?.toLowerCase().includes('alta') ? 'bad' : 'warn')}"><i></i><div><b>${esc(symptom.name)}</b><small>${esc(symptom.area || '')}${symptom.driveRisk ? ` · ${esc(symptom.driveRisk)}` : ''}</small></div></div>`).join('')}
      </div></div>` : '';
    const dtcs = (data.dtcs || []).length ? `
      <div class="pr-block"><h4>Códigos leídos</h4><div class="pr-flags-list">
        ${data.dtcs.map(code => `<div class="pr-flag ${code.severity === 'alta' ? 'bad' : 'warn'}"><i></i><div><b>${esc(code.code)} · ${esc(code.title)}</b><small>${esc(code.system)} · urgencia ${esc(code.severity)}</small></div></div>`).join('')}
      </div></div>` : '';
    const why = (data.why || []).length ? `<div class="pr-block"><h4>Por qué</h4><ul class="pr-list">${data.why.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>` : '';

    result.hidden = false;
    result.innerHTML = `
      <div class="pr-triage-hero ${tone}">
        <span class="pr-pill ${tone}">${esc(data.label)}</span>
        <h3>${esc(data.headline)}</h3>
        <p>${data.canDrive ? 'Puedes mover el coche con precaución, pero no conviertas esto en un viaje largo.' : 'No circules. Primero asegura el coche y pide asistencia.'}</p>
        <div class="pr-triage-actions">
          <a class="pr-btn primary" href="${esc(data.help?.mapUrl || 'https://www.google.com/maps/search/?api=1&query=taller+mecanico+cerca+de+mi')}" target="_blank" rel="noopener">Buscar talleres cerca</a>
          <button class="pr-btn cyan" type="button" id="triageShare">Compartir</button>
          <a class="pr-btn ghost" href="https://wa.me/?text=${encodeURIComponent(data.share || '')}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="pr-btn danger" href="tel:112">Llamar al 112</a>
        </div>
      </div>
      <div class="pr-grid-2">
        <div class="pr-block"><h4>Ahora mismo</h4><ol class="pr-list">${(data.immediate || []).map(item => `<li>${esc(item)}</li>`).join('')}</ol></div>
        <div class="pr-block"><h4>No hagas esto</h4><ul class="pr-list">${(data.avoid || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      </div>
      <div class="pr-kpis">
        <div class="pr-kpi"><span>Confianza</span><b>${esc(data.confidence || 'baja')}</b><small>según datos introducidos</small></div>
        <div class="pr-kpi"><span>Semáforo</span><b>${esc(data.level)}</b><small>${data.canDrive ? 'se puede mover' : 'detente'}</small></div>
        <div class="pr-kpi"><span>Asistencia</span><b>112</b><small>${esc(data.help?.insuranceHint || '')}</small></div>
      </div>
      <div class="pr-grid-2">
        <div>${why}${symptoms}${dtcs}</div>
        <div><div class="pr-block"><h4>Qué comprobar después</h4><ol class="pr-list">${(data.next || []).map(item => `<li>${esc(item)}</li>`).join('')}</ol></div>
        <div class="pr-block"><h4>Comparte con tu taller</h4><p class="pr-note">${esc(data.disclaimer)}</p></div></div>
      </div>
      <div class="pr-actions">
        <button class="pr-btn primary" type="button" id="triageShareBottom">Compartir por WhatsApp o copiar</button>
        <button class="pr-btn cyan" type="button" id="triageLocation">Compartir mi ubicación con un familiar</button>
        <button class="pr-btn ghost" type="button" id="triagePrint">Imprimir / guardar PDF</button>
      </div>
    `;
    const share = () => shareText(data.share, '¿Puedo conducir?');
    $('#triageShare')?.addEventListener('click', share);
    $('#triageShareBottom')?.addEventListener('click', share);
    $('#triagePrint')?.addEventListener('click', () => window.print());
    $('#triageLocation')?.addEventListener('click', shareLocation);
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function shareLocation() {
    if (!navigator.geolocation) {
      toast('Tu navegador no permite compartir la ubicación.');
      return;
    }
    toast('Pidiendo ubicación…');
    navigator.geolocation.getCurrentPosition(position => {
      const lat = position.coords.latitude.toFixed(6);
      const lon = position.coords.longitude.toFixed(6);
      const url = `https://www.google.com/maps?q=${lat},${lon}`;
      const text = `Estoy en el coche y necesito ayuda. Mi ubicación: ${url}`;
      window.open(waLink(text), '_blank', 'noopener');
    }, () => toast('No se ha podido obtener la ubicación. Revisa los permisos del navegador.'), {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  }

  function bindTriage() {
    const form = $('#triageForm');
    const status = $('#triageStatus');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('#triageSubmit');
      const text = $('#triageText').value.trim();
      const dtc = $('#triageDtc').value.trim();
      const flags = $$('.pr-flags input:checked').map(input => input.value);
      if (!text && !dtc && !flags.length) {
        showStatus(status, 'Cuéntame el síntoma, el código o marca una señal de alarma.', 'error');
        return;
      }
      setBusy(button, true, 'Comprobando…');
      showStatus(status, '');
      $('#triageResult').hidden = true;
      try {
        const data = await api('/api/proteccion/triaje', {
          method: 'POST',
          body: JSON.stringify({ text, dtc, flags, vehicleId: $('#healthVehicle').value || undefined })
        });
        state.triage = data;
        renderTriage(data);
      } catch (error) {
        showStatus(status, error.message, 'error');
      } finally {
        setBusy(button, false);
      }
    });
  }

  bindTabs();
  bindQuote();
  bindAuth();
  bindHealth();
  bindTriage();
  loadSession().catch(() => {
    $('#healthLoading').hidden = true;
    $('#healthAuth').hidden = false;
    $('#healthApp').hidden = true;
  });
})();
