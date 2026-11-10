// MI GARAJE · módulo privado de vehículos, mantenimiento e historial
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = window.esc;
  const icon = window.icon;
  const api = window.api;
  const fmtNum = window.fmtNum;

  const state = {
    user: null,
    vehicles: [],
    vehicle: null,
    aiContext: null,
    tab: 'resumen',
    draft: null,
    ficha: null,
    photo: null,
    showVin: false,
    historyFilter: '',
    editingEvent: null,
    chat: []
  };

  if (!$('#view-garaje')) return;

  const money = value => (value === null || value === undefined || value === '')
    ? '—'
    : `${Number(value).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
  const km = value => (value === null || value === undefined)
    ? '—'
    : `${Number(value).toLocaleString('es-ES')} km`;
  const dateLabel = iso => {
    if (!iso) return '—';
    const parts = String(iso).split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const vehicleName = v => [v.brand, v.model, v.version].filter(Boolean).join(' ');
  const tabLabel = { resumen: 'Ficha', mantenimiento: 'Mantenimiento', averias: 'Averías', historial: 'Historial', documentos: 'Documentos', ia: 'Asistente IA' };

  function notify(message = '', kind = '') {
    const box = $('#garageNotice');
    if (!box) return;
    box.textContent = message;
    box.className = `garage-notice${message ? '' : ' hidden'}${kind ? ` ${kind}` : ''}`;
    if (message) {
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => { box.textContent = ''; box.classList.add('hidden'); }, 6000);
    }
  }

  function setHidden(selector, hidden) {
    const el = $(selector);
    if (el) el.classList.toggle('hidden', hidden);
  }

  // ----------------------------------------------------------------
  // Sesión y arranque
  // ----------------------------------------------------------------
  async function bootstrap() {
    setHidden('#garageLoading', false);
    setHidden('#garageAuth', true);
    setHidden('#garageApp', true);
    try {
      const status = await api('/api/garage/status');
      state.user = status.user;
      setHidden('#garageApp', false);
      await loadVehicles();
      await consumePendingAdd();
    } catch {
      state.user = null;
      state.vehicles = [];
      setHidden('#garageAuth', false);
      setHidden('#garageApp', true);
      renderAuthNotice(pendingFicha
        ? 'Tu ficha está lista. Entra o crea la cuenta y la leemos sola en cuanto inicies sesión.'
        : '');
    } finally {
      setHidden('#garageLoading', true);
    }
  }

  function renderAuthNotice(message, kind = '') {
    const box = $('#garageAuthMsg');
    if (!box) return;
    box.textContent = message;
    box.className = `garage-msg${message ? '' : ' hidden'}${kind ? ` ${kind}` : ''}`;
  }

  async function authRequest(url, payload) {
    renderAuthNotice('Comprobando…');
    try {
      await api(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      renderAuthNotice('');
      await bootstrap();
      notify('Sesión iniciada. Tu garaje está listo.', 'ok');
    } catch (error) {
      renderAuthNotice(error.message || 'No se pudo iniciar sesión.', 'error');
    }
  }

  $('#garageLoginForm')?.addEventListener('submit', event => {
    event.preventDefault();
    authRequest('/api/forum/auth/login', {
      username: $('#garageLoginUser')?.value.trim() || '',
      password: $('#garageLoginPass')?.value || ''
    });
  });

  $('#garageRegisterForm')?.addEventListener('submit', event => {
    event.preventDefault();
    authRequest('/api/forum/auth/register', {
      username: $('#garageRegUser')?.value.trim() || '',
      displayName: $('#garageRegName')?.value.trim() || $('#garageRegUser')?.value.trim() || '',
      password: $('#garageRegPass')?.value || ''
    });
  });

  $('#garageDeleteAccount')?.addEventListener('click', async () => {
    const first = window.confirm('Se eliminarán tu cuenta, vehículos, fotos, documentos, mensajes y publicaciones. Esta acción no se puede deshacer. ¿Continuar?');
    if (!first) return;
    const typed = window.prompt('Escribe ELIMINAR para confirmar definitivamente:');
    if (String(typed || '').trim().toUpperCase() !== 'ELIMINAR') {
      notify('Eliminación cancelada: no se ha borrado nada.', 'error');
      return;
    }
    const button = $('#garageDeleteAccount');
    if (button) { button.disabled = true; button.textContent = 'Eliminando…'; }
    try {
      await api('/api/forum/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'ELIMINAR' })
      });
      state.user = null;
      state.vehicles = [];
      state.vehicle = null;
      setHidden('#garageApp', true);
      setHidden('#garageAuth', true);
      setHidden('#garageLoading', false);
      notify('Cuenta y datos eliminados.', 'ok');
      window.alert('Tu cuenta y tus datos se han eliminado. Se ha cerrado la sesión.');
      if (typeof window.showView === 'function') window.showView('home');
      await bootstrap();
    } catch (error) {
      notify(error.message || 'No se pudo eliminar la cuenta.', 'error');
      if (button) { button.disabled = false; button.textContent = 'Eliminar mi cuenta'; }
    }
  });

  // ----------------------------------------------------------------
  // Lista de vehículos
  // ----------------------------------------------------------------
  async function loadVehicles() {
    const data = await api('/api/garage/vehicles');
    state.vehicles = data.vehicles || [];
    const stats = data.stats || {};
    if ($('#garageCount')) $('#garageCount').textContent = String(state.vehicles.length);
    if ($('#garageSpent')) $('#garageSpent').textContent = money(stats.spent || 0);
    renderList();
  }

  function alertsHTML(alerts = []) {
    if (!alerts.length) return '';
    return `<div class="garage-alerts">${alerts.map(alert => `
      <span class="garage-alert ${esc(alert.level)}">${icon(alert.level === 'vencido' ? 'alert' : 'clock')}<b>${esc(alert.label)}</b> ${esc(alert.detail)}</span>`).join('')}</div>`;
  }

  function renderList() {
    const grid = $('#garageList');
    if (!grid) return;
    setHidden('#garageEmpty', state.vehicles.length > 0);
    if (!state.vehicles.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = state.vehicles.map(vehicle => {
      const label = vehicleName(vehicle);
      return `<article class="garage-card panel" data-open="${vehicle.id}" tabindex="0" role="button" aria-label="Abrir ficha de ${esc(label)}">
        <div class="garage-photo">
          ${vehicle.hasPhoto
            ? `<img src="${esc(vehicle.photoUrl)}" alt="Fotografía de ${esc(label)}" loading="lazy">`
            : icon('car')}
          <span class="garage-plate">${esc(vehicle.plate || 'Sin matrícula')}</span>
        </div>
        <div class="garage-card-body">
          <h3>${esc(vehicle.brand)} ${esc(vehicle.model)}</h3>
          <p class="garage-version">${esc(vehicle.version || 'Versión no indicada')}</p>
          <div class="garage-meta">
            <span>${vehicle.year || '—'}</span>
            <span>${esc(vehicle.fuel || 'Combustible no indicado')}</span>
            <span>${km(vehicle.mileage)}</span>
          </div>
          ${alertsHTML(vehicle.alerts || [])}
          <div class="garage-card-foot">
            <span>${fmtNum(vehicle.counts.events)} registros · ${fmtNum(vehicle.counts.documents)} documentos</span>
            <b>${money(vehicle.counts.spent)}</b>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  $('#garageList')?.addEventListener('click', event => {
    const card = event.target.closest('[data-open]');
    if (!card) return;
    openVehicle(Number(card.dataset.open));
  });

  $('#garageList')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-open]');
    if (!card) return;
    event.preventDefault();
    openVehicle(Number(card.dataset.open));
  });

  $('#garageAddBtn')?.addEventListener('click', openAdd);
  $('#garageEmpty')?.addEventListener('click', event => {
    if (event.target.closest('[data-garage-add]')) openAdd();
  });

  // ----------------------------------------------------------------
  // Alta de vehículo (OCR de la ficha técnica)
  // ----------------------------------------------------------------
  function openAdd() {
    state.draft = null;
    state.ficha = null;
    state.photo = null;
    setHidden('#garageDetail', true);
    setHidden('#garageAdd', false);
    renderAdd();
    $('#garageAdd')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeAdd() {
    setHidden('#garageAdd', true);
    const box = $('#garageAdd');
    if (box) box.innerHTML = '';
  }

  function renderAdd(message = '', kind = '') {
    const box = $('#garageAdd');
    if (!box) return;
    if (state.draft) return renderVehicleForm({ mode: 'create', message, kind });

    box.innerHTML = `
      <div class="panel-head">
        <div><span class="eyebrow">NUEVO VEHÍCULO</span><h3>Identifica tu coche</h3></div>
        <button class="icon-btn" type="button" data-add-close aria-label="Cerrar">${icon('close')}</button>
      </div>
      <div class="garage-add-options">
        <label class="garage-add-option" tabindex="0">
          <span class="garage-add-ico">${icon('upload')}</span>
          <b>Foto de la ficha técnica</b>
          <small>JPG, PNG, WebP o PDF · hasta 12 MB. Se leen matrícula, bastidor, fecha de matriculación, motor, cilindrada, potencia, plazas y masa.</small>
          <span class="btn ghost sm">Elegir ficha</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-ficha hidden>
        </label>
        <button class="garage-add-option" type="button" data-manual>
          <span class="garage-add-ico cyan">${icon('wrench')}</span>
          <b>Introducir a mano</b>
          <small>Rellena solo lo que sepas. Siempre podrás completarlo después.</small>
          <span class="btn ghost sm">Rellenar datos</span>
        </button>
      </div>
      ${message ? `<p class="garage-msg ${esc(kind)}">${esc(message)}</p>` : ''}
      <p class="garage-privacy">${icon('lock')} El documento se analiza en este servidor. Solo se guarda si tú lo marcas como documentación privada, y únicamente lo puedes ver tú.</p>`;

    box.querySelector('[data-add-close]')?.addEventListener('click', closeAdd);
    box.querySelector('[data-manual]')?.addEventListener('click', () => {
      state.draft = {};
      renderVehicleForm({ mode: 'create' });
    });
    const input = box.querySelector('[data-ficha]');
    box.querySelector('.garage-add-option')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input?.click();
      }
    });
    input?.addEventListener('click', event => event.stopPropagation());
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) scanFicha(file);
    });
  }

  const FIELDS = [
    ['brand', 'Marca', 'text', true, 'Volkswagen'],
    ['model', 'Modelo', 'text', true, 'Golf'],
    ['version', 'Versión', 'text', false, '2.0 TDI 150 CV'],
    ['year', 'Año', 'number', false, '2016'],
    ['firstRegistration', 'Primera matriculación', 'date', false, ''],
    ['plate', 'Matrícula', 'text', false, '1234 ABC'],
    ['vin', 'Bastidor (VIN)', 'text', false, '17 caracteres'],
    ['engineCode', 'Código de motor', 'text', false, 'CRLB'],
    ['displacementCc', 'Cilindrada (cc)', 'number', false, '1968'],
    ['powerPs', 'Potencia (CV)', 'number', false, '150'],
    ['fuel', 'Combustible', 'text', false, 'Diésel'],
    ['transmission', 'Cambio', 'text', false, 'Manual'],
    ['seats', 'Plazas', 'number', false, '5'],
    ['massKg', 'Masa en orden de marcha (kg)', 'number', false, '1385'],
    ['mileage', 'Kilómetros actuales', 'number', false, '142000'],
    ['acquiredAt', 'Fecha de adquisición', 'date', false, '']
  ];

  function fieldValue(draft, key) {
    const value = draft?.[key];
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function renderVehicleForm({ mode, message = '', kind = '' }) {
    const box = $('#garageAdd');
    if (!box) return;
    const draft = state.draft || {};
    const isEdit = mode === 'edit';
    box.innerHTML = `
      <div class="panel-head">
        <div>
          <span class="eyebrow">${isEdit ? 'EDITAR VEHÍCULO' : 'REVISIÓN OBLIGATORIA'}</span>
          <h3>${isEdit ? esc(vehicleName(draft)) : 'Confirma los datos del coche'}</h3>
        </div>
        <button class="icon-btn" type="button" data-add-close aria-label="Cerrar">${icon('close')}</button>
      </div>
      ${message ? `<p class="garage-msg ${esc(kind)}">${esc(message)}</p>` : ''}
      <form class="garage-form garage-vehicle-form" data-vehicle-form novalidate>
        <div class="garage-fields">
          ${FIELDS.map(([key, label, type, required, placeholder]) => `
            <label class="garage-field">
              <span>${esc(label)}${required ? ' *' : ''}</span>
              <input name="${key}" type="${type}" value="${esc(fieldValue(draft, key))}" placeholder="${esc(placeholder)}"${type === 'number' ? ' min="0" inputmode="numeric"' : ''}${required ? ' required' : ''} autocomplete="off">
            </label>`).join('')}
          <label class="garage-field garage-field-wide">
            <span>Observaciones personales</span>
            <textarea name="notes" rows="3" maxlength="2000" placeholder="Estado, extras, cosas a revisar…">${esc(fieldValue(draft, 'notes'))}</textarea>
          </label>
        </div>

        <div class="garage-attach">
          <div class="garage-attach-row">
            <label class="btn ghost sm" for="garageCarPhoto">${icon('image')} ${state.photo ? 'Cambiar foto del coche' : 'Añadir foto del coche'}</label>
            <input id="garageCarPhoto" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <span class="garage-attach-note">${state.photo ? 'Foto preparada.' : 'Opcional. Se reduce a 1600 px antes de subirla.'}</span>
            ${state.photo ? `<button class="btn ghost sm" type="button" data-photo-clear>Quitar</button>` : ''}
          </div>
          ${state.ficha ? `<label class="garage-check"><input type="checkbox" name="saveFicha" ${state.saveFicha === false ? '' : 'checked'}> Guardar la ficha técnica en Documentación privada</label>` : ''}
        </div>

        <div class="garage-form-actions">
          <button class="btn primary" type="submit">${isEdit ? 'Guardar cambios' : 'Guardar vehículo'}</button>
          <button class="btn ghost" type="button" data-add-close>Cancelar</button>
        </div>
        <p class="garage-privacy">${icon('shield')} La IA no inventa datos: si un campo queda vacío se guarda como desconocido. Corrige siempre lo que haya leído el OCR.</p>
      </form>`;

    box.querySelectorAll('[data-add-close]').forEach(btn => btn.addEventListener('click', () => {
      if (isEdit) { closeAdd(); renderDetail(); } else closeAdd();
    }));

    box.querySelector('#garageCarPhoto')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        state.photo = await compressImage(file);
        renderVehicleForm({ mode, message: 'Foto del coche preparada.', kind: 'ok' });
      } catch (error) {
        renderVehicleForm({ mode, message: error.message, kind: 'error' });
      }
    });
    box.querySelector('[data-photo-clear]')?.addEventListener('click', () => {
      state.photo = null;
      renderVehicleForm({ mode });
    });
    box.querySelector('input[name="saveFicha"]')?.addEventListener('change', event => {
      state.saveFicha = event.target.checked;
    });

    box.querySelector('[data-vehicle-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      submitVehicleForm(event.target, mode);
    });
  }

  async function submitVehicleForm(form, mode) {
    const payload = {};
    new FormData(form).forEach((value, key) => {
      if (key === 'saveFicha') return;
      payload[key] = String(value).trim();
    });
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      let vehicle;
      if (mode === 'edit') {
        const result = await api(`/api/garage/vehicles/${state.vehicle.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        vehicle = result.vehicle;
        notify('Vehículo actualizado.', 'ok');
      } else {
        const result = await api('/api/garage/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        vehicle = result.vehicle;
        const saveFicha = form.querySelector('input[name="saveFicha"]')?.checked;
        if (state.photo) {
          await api(`/api/garage/vehicles/${vehicle.id}/photo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: state.photo })
          }).catch(() => null);
        }
        if (saveFicha && state.ficha) {
          await api(`/api/garage/vehicles/${vehicle.id}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: state.ficha.dataUrl, name: state.ficha.name, kind: 'ficha_tecnica' })
          }).catch(() => null);
        }
        notify(`${vehicleName(vehicle)} guardado en tu garaje.`, 'ok');
      }
      state.draft = null;
      state.ficha = null;
      state.photo = null;
      closeAdd();
      await loadVehicles();
      await openVehicle(vehicle.id);
    } catch (error) {
      if (button) button.disabled = false;
      state.draft = { ...(state.draft || {}), ...payload };
      renderVehicleForm({ mode, message: error.message || 'No se pudo guardar.', kind: 'error' });
    }
  }

  // ----------------------------------------------------------------
  // OCR de la ficha técnica
  // ----------------------------------------------------------------
  async function scanFicha(file) {
    const box = $('#garageAdd');
    if (!box) return;
    if (file.size > 12 * 1024 * 1024) return renderAdd('El archivo supera 12 MB.', 'error');
    box.insertAdjacentHTML('beforeend', '<div class="garage-scanning"><span class="garage-spinner"></span> Leyendo la ficha técnica en local… Puede tardar unos segundos.</div>');
    try {
      const original = await fileToDataUrl(file);
      const result = await api('/api/vehicle/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataBase64: original, mimeType: file.type, fileName: file.name })
      });
      const extracted = result.extracted || {};
      const pick = key => {
        const item = extracted[key];
        return item && item.value !== undefined && item.value !== null ? item.value : '';
      };
      state.draft = {
        brand: pick('brand'),
        model: pick('model'),
        version: pick('generation'),
        year: pick('year'),
        firstRegistration: pick('firstRegistration'),
        plate: pick('plate'),
        vin: pick('vin'),
        engineCode: pick('engineCode'),
        displacementCc: pick('displacementCc'),
        powerPs: pick('powerPs'),
        fuel: pick('fuel'),
        transmission: pick('transmission'),
        seats: pick('seats'),
        massKg: pick('massKg'),
        mileage: '',
        acquiredAt: '',
        notes: ''
      };
      state.ficha = {
        dataUrl: file.type === 'application/pdf' ? original : await shrinkForStorage(file),
        name: file.name || 'ficha-tecnica.jpg'
      };
      state.saveFicha = true;
      renderVehicleForm({
        mode: 'create',
        message: `Leído con ${result.confidence?.overall || 'confianza baja'}. ${(result.warnings || [])[0] || ''}`,
        kind: 'ok'
      });
    } catch (error) {
      renderAdd(error.message || 'No se pudo leer la ficha. Prueba con una foto más nítida o introduce los datos a mano.', 'error');
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('La imagen no se pudo procesar.'));
      img.src = src;
    });
  }

  async function compressImage(file, max = 1600, quality = 0.82) {
    if (!/^image\//.test(file.type || '')) throw new Error('Usa una fotografía JPG, PNG o WebP.');
    if (file.size > 12 * 1024 * 1024) throw new Error('La fotografía supera 12 MB.');
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function shrinkForStorage(file) {
    if (file.type === 'application/pdf') return fileToDataUrl(file);
    return compressImage(file, 2200, 0.9);
  }

  // ----------------------------------------------------------------
  // Ficha del vehículo
  // ----------------------------------------------------------------
  async function openVehicle(id) {
    try {
      const data = await api(`/api/garage/vehicles/${id}`);
      state.vehicle = data.vehicle;
      state.aiContext = data.aiContext;
      state.tab = 'resumen';
      state.showVin = false;
      state.chat = [];
      closeAdd();
      setHidden('#garageDetail', false);
      renderDetail();
      $('#garageDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      notify(error.message || 'No se pudo abrir el vehículo.', 'error');
    }
  }

  const TABS = ['resumen', 'mantenimiento', 'averias', 'historial', 'documentos', 'ia'];

  function renderDetail() {
    const box = $('#garageDetail');
    const vehicle = state.vehicle;
    if (!box || !vehicle) return;
    box.innerHTML = `
      <div class="garage-detail-head panel">
        <div class="garage-detail-photo">
          ${vehicle.hasPhoto
            ? `<img src="${esc(vehicle.photoUrl)}?t=${encodeURIComponent(vehicle.updatedAt || '')}" alt="Fotografía de ${esc(vehicleName(vehicle))}">`
            : `<div class="garage-photo-empty">${icon('car')}<span>Sin foto</span></div>`}
          <label class="garage-photo-btn" title="Cambiar fotografía">${icon('image')}
            <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input hidden>
          </label>
          ${vehicle.hasPhoto ? `<button class="garage-photo-del" type="button" data-photo-delete title="Eliminar fotografía">${icon('trash')}</button>` : ''}
        </div>
        <div class="garage-detail-id">
          <span class="eyebrow">${esc(vehicle.plate || 'SIN MATRÍCULA')} · ${vehicle.year || 'AÑO NO INDICADO'}</span>
          <h3>${esc(vehicle.brand)} ${esc(vehicle.model)}</h3>
          <p class="garage-version">${esc(vehicle.version || 'Versión no indicada')}</p>
          <div class="garage-meta">
            <span>${esc(vehicle.engineCode || 'Código de motor sin dato')}</span>
            <span>${km(vehicle.mileage)}</span>
            <span>${esc(vehicle.fuel || 'Combustible sin dato')}</span>
          </div>
          ${alertsHTML(vehicle.alerts || [])}
          <div class="garage-detail-actions">
            <button class="btn ghost sm" type="button" data-edit-vehicle>${icon('wrench')} Editar datos</button>
            <button class="btn ghost sm" type="button" data-view-diagnostico>${icon('pulse')} Diagnosticar</button>
            <button class="btn ghost sm danger" type="button" data-delete-vehicle>${icon('trash')} Eliminar vehículo</button>
          </div>
        </div>
      </div>

      <nav class="garage-tabs" aria-label="Secciones del vehículo">
        ${TABS.map(tab => `<button type="button" class="garage-tab${state.tab === tab ? ' active' : ''}" data-tab="${tab}">${esc(tabLabel[tab])}</button>`).join('')}
      </nav>
      <div class="garage-panel panel" id="garageTabPanel">${renderTab()}</div>`;

    box.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      renderDetail();
    }));
    box.querySelector('[data-edit-vehicle]')?.addEventListener('click', () => {
      state.draft = { ...vehicleFields(vehicle) };
      setHidden('#garageDetail', true);
      setHidden('#garageAdd', false);
      renderVehicleForm({ mode: 'edit' });
      $('#garageAdd')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.querySelector('[data-view-diagnostico]')?.addEventListener('click', () => {
      if (typeof window.setVehicleState === 'function') {
        window.setVehicleState({
          id: '',
          brand: vehicle.brand,
          model: vehicle.model,
          engine: [vehicle.version, vehicle.engineCode, vehicle.powerPs ? `${vehicle.powerPs} CV` : ''].filter(Boolean).join(' · ')
        }, 'garaje');
        const year = $('#fYear');
        if (year && vehicle.year) year.value = vehicle.year;
      }
      if (typeof window.showView === 'function') window.showView('diagnostico');
    });
    box.querySelector('[data-delete-vehicle]')?.addEventListener('click', () => deleteVehicle());
    box.querySelector('[data-photo-input]')?.addEventListener('change', event => uploadPhoto(event.target));
    box.querySelector('[data-photo-delete]')?.addEventListener('click', () => removePhoto());
    bindTabPanel(box);
  }

  function vehicleFields(vehicle) {
    return {
      brand: vehicle.brand, model: vehicle.model, version: vehicle.version, year: vehicle.year,
      firstRegistration: vehicle.firstRegistration, plate: vehicle.plate, vin: vehicle.vin,
      engineCode: vehicle.engineCode, displacementCc: vehicle.displacementCc, powerPs: vehicle.powerPs,
      fuel: vehicle.fuel, transmission: vehicle.transmission, seats: vehicle.seats,
      massKg: vehicle.massKg, mileage: vehicle.mileage, acquiredAt: vehicle.acquiredAt, notes: vehicle.notes
    };
  }

  async function uploadPhoto(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = await compressImage(file);
      const result = await api(`/api/garage/vehicles/${state.vehicle.id}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      await refreshDetail(result.vehicle.id);
      notify('Fotografía actualizada.', 'ok');
    } catch (error) {
      notify(error.message || 'No se pudo subir la fotografía.', 'error');
    }
  }

  async function removePhoto() {
    if (!window.confirm('¿Eliminar la fotografía de este coche?')) return;
    try {
      await api(`/api/garage/vehicles/${state.vehicle.id}/photo`, { method: 'DELETE' });
      await refreshDetail(state.vehicle.id);
      notify('Fotografía eliminada.', 'ok');
    } catch (error) {
      notify(error.message || 'No se pudo eliminar la fotografía.', 'error');
    }
  }

  async function deleteVehicle() {
    const name = vehicleName(state.vehicle);
    if (!window.confirm(`¿Eliminar ${name} de tu garaje? Se borrarán también su historial, sus fotos y sus documentos. Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/garage/vehicles/${state.vehicle.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });
      state.vehicle = null;
      setHidden('#garageDetail', true);
      await loadVehicles();
      notify(`${name} eliminado de tu garaje.`, 'ok');
    } catch (error) {
      notify(error.message || 'No se pudo eliminar el vehículo.', 'error');
    }
  }

  async function refreshDetail(id = state.vehicle?.id) {
    if (!id) return;
    const data = await api(`/api/garage/vehicles/${id}`);
    state.vehicle = data.vehicle;
    state.aiContext = data.aiContext;
    renderDetail();
    await loadVehicles();
  }

  function renderTab() {
    switch (state.tab) {
      case 'mantenimiento': return tabMantenimiento();
      case 'averias': return tabAverias();
      case 'historial': return tabHistorial();
      case 'documentos': return tabDocumentos();
      case 'ia': return tabIA();
      default: return tabResumen();
    }
  }

  const vinMask = vin => vin ? `•••••••••••••${vin.slice(-4)}` : '—';

  function dataRow(label, value) {
    return `<div><span>${esc(label)}</span><b>${value === null || value === undefined || value === '' ? '—' : esc(String(value))}</b></div>`;
  }

  function tabResumen() {
    const v = state.vehicle;
    return `
      <div class="garage-stats">
        <div class="garage-stat"><span>Gasto registrado</span><b>${money(v.stats.spentTotal)}</b><small>${money(v.stats.spentThisYear)} este año</small></div>
        <div class="garage-stat"><span>Registros</span><b>${fmtNum(v.stats.events)}</b><small>mantenimiento, averías, ITV…</small></div>
        <div class="garage-stat"><span>Documentos</span><b>${fmtNum(v.documents.length)}</b><small>privados</small></div>
        <div class="garage-stat"><span>Avisos abiertos</span><b>${fmtNum(v.alerts.length)}</b><small>${v.alerts.length ? 'revisa mantenimiento' : 'todo al día'}</small></div>
      </div>
      ${v.alerts.length ? `<div class="garage-block"><h4>Avisos de mantenimiento</h4>${alertsHTML(v.alerts)}</div>` : ''}
      <div class="garage-block">
        <h4>Ficha técnica digital</h4>
        <div class="garage-data">
          ${dataRow('Marca', v.brand)}
          ${dataRow('Modelo', v.model)}
          ${dataRow('Versión', v.version)}
          ${dataRow('Año', v.year)}
          ${dataRow('Primera matriculación', v.firstRegistration ? dateLabel(v.firstRegistration) : '')}
          ${dataRow('Matrícula', v.plate)}
          <div><span>Bastidor (VIN)</span><b>${v.vin ? `${state.showVin ? esc(v.vin) : vinMask(v.vin)} <button class="garage-link" type="button" data-vin-toggle>${state.showVin ? 'Ocultar' : 'Mostrar'}</button>` : '—'}</b></div>
          ${dataRow('Código de motor', v.engineCode)}
          ${dataRow('Cilindrada', v.displacementCc ? `${fmtNum(v.displacementCc)} cc` : '')}
          ${dataRow('Potencia', [v.powerPs ? `${v.powerPs} CV` : '', v.powerKw ? `${v.powerKw} kW` : ''].filter(Boolean).join(' · '))}
          ${dataRow('Combustible', v.fuel)}
          ${dataRow('Cambio', v.transmission)}
          ${dataRow('Plazas', v.seats)}
          ${dataRow('Masa en orden de marcha', v.massKg ? `${fmtNum(v.massKg)} kg` : '')}
          ${dataRow('Kilometraje', km(v.mileage))}
          ${dataRow('Fecha de adquisición', v.acquiredAt ? dateLabel(v.acquiredAt) : '')}
        </div>
      </div>
      <div class="garage-block">
        <h4>Observaciones</h4>
        <p class="garage-notes">${v.notes ? esc(v.notes) : 'Sin observaciones.'}</p>
      </div>
      <p class="garage-privacy">${icon('lock')} El bastidor y la matrícula solo se muestran a tu cuenta. No aparecen en el foro ni en las respuestas públicas.`;
  }

  function guideHTML() {
    const guide = state.vehicle.guide || {};
    if (!guide.matched) {
      return `<div class="garage-block">
        <h4>Intervalos de mantenimiento</h4>
        <p class="garage-empty-note">${icon('alert')} ${esc(guide.note || 'Sin datos documentados para este motor.')}</p>
      </div>`;
    }
    const last = state.vehicle.stats.lastMaintenance || {};
    return `<div class="garage-block">
      <h4>Mantenimiento documentado para ${esc(guide.matched.family)}</h4>
      <p class="garage-note">${esc(guide.note)}</p>
      <div class="garage-guide">
        ${guide.items.map(item => `
          <article class="garage-guide-item">
            <header>
              <b>${esc(item.label)}</b>
              <span class="tag">${esc(item.interval)}</span>
            </header>
            ${item.note ? `<p>${esc(item.note)}</p>` : ''}
            ${last[item.key] ? `<p class="garage-last">${icon('check')} Último registro: ${dateLabel(last[item.key].date)} · ${km(last[item.key].mileage)}${last[item.key].cost ? ` · ${money(last[item.key].cost)}` : ''}</p>` : `<p class="garage-last missing">Sin registro en tu garaje todavía.</p>`}
            ${item.sources?.length ? `<p class="garage-src">Fuentes: ${item.sources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || source.url)}</a>`).join(' · ')}</p>` : ''}
          </article>`).join('')}
      </div>
    </div>`;
  }

  function maintenanceForm() {
    const items = state.vehicle.maintenanceItems || [];
    return `<form class="garage-form garage-event-form" data-form="event">
      <input type="hidden" name="kind" value="mantenimiento">
      <div class="garage-fields">
        <label class="garage-field"><span>Operación</span>
          <select name="item">${items.map(item => `<option value="${esc(item.key)}">${esc(item.label)}</option>`).join('')}</select>
        </label>
        <label class="garage-field"><span>Título</span><input name="title" maxlength="120" placeholder="Cambio de aceite y filtro" required></label>
        <label class="garage-field"><span>Fecha</span><input name="date" type="date" value="${today()}" required></label>
        <label class="garage-field"><span>Kilometraje</span><input name="mileage" type="number" min="0" inputmode="numeric" placeholder="${state.vehicle.mileage || ''}"></label>
        <label class="garage-field"><span>Coste (€)</span><input name="cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="95"></label>
        <label class="garage-field"><span>Próximo cambio (fecha)</span><input name="nextDate" type="date"></label>
        <label class="garage-field"><span>Próximo cambio (km)</span><input name="nextMileage" type="number" min="0" inputmode="numeric"></label>
        <label class="garage-field garage-field-wide"><span>Piezas y observaciones</span><textarea name="description" rows="2" maxlength="4000" placeholder="Aceite 5W-30, filtro original, taller…"></textarea></label>
      </div>
      <div class="garage-form-actions"><button class="btn primary sm" type="submit">Registrar mantenimiento</button></div>
    </form>`;
  }

  function eventCard(event, { showDetails = true } = {}) {
    return `<article class="garage-event" data-event="${event.id}">
      <header>
        <span class="garage-event-kind ${esc(event.kind)}">${esc(event.kindLabel)}</span>
        <span class="garage-event-date">${dateLabel(event.date)}${event.mileage !== null ? ` · ${km(event.mileage)}` : ''}</span>
        ${event.cost !== null ? `<b class="garage-event-cost">${money(event.cost)}</b>` : ''}
      </header>
      <h4>${esc(event.title)}</h4>
      ${showDetails ? `
        ${event.dtc ? `<p><b>DTC:</b> ${esc(event.dtc)}</p>` : ''}
        ${event.description ? `<p>${esc(event.description)}</p>` : ''}
        ${event.cause ? `<p><b>Causa:</b> ${esc(event.cause)}</p>` : ''}
        ${event.checks ? `<p><b>Comprobaciones:</b> ${esc(event.checks)}</p>` : ''}
        ${event.parts ? `<p><b>Piezas:</b> ${esc(event.parts)}</p>` : ''}
      ` : ''}
      ${event.nextDate || event.nextMileage !== null ? `<p class="garage-next">${icon('clock')} Próximo: ${event.nextDate ? dateLabel(event.nextDate) : ''}${event.nextMileage !== null ? ` · ${km(event.nextMileage)}` : ''}</p>` : ''}
      <div class="garage-event-actions">
        ${['mantenimiento', 'averia', 'reparacion'].includes(event.kind) ? `<button class="garage-link" type="button" data-edit-event="${event.id}">Editar</button>` : ''}
        <button class="garage-link danger" type="button" data-delete-event="${event.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function tabMantenimiento() {
    const events = state.vehicle.events.filter(event => event.kind === 'mantenimiento');
    return `
      ${alertsHTML(state.vehicle.alerts)}
      ${guideHTML()}
      <div class="garage-block">
        <h4>Registrar mantenimiento</h4>
        ${maintenanceForm()}
      </div>
      <div class="garage-block">
        <h4>Registros de mantenimiento</h4>
        ${events.length ? `<div class="garage-events">${events.map(event => eventCard(event)).join('')}</div>` : '<p class="garage-empty-note">Todavía no has registrado mantenimientos de este coche.</p>'}
      </div>`;
  }

  function issueFields() {
    return `
    <label class="garage-field"><span>Tipo</span>
      <select name="kind">
        <option value="averia">Avería</option>
        <option value="reparacion">Reparación</option>
      </select>
    </label>
    <label class="garage-field"><span>Título</span><input name="title" maxlength="120" placeholder="Testigo de motor y tirones" required></label>
    <label class="garage-field"><span>Código DTC</span><input name="dtc" maxlength="20" placeholder="P0401"></label>
    <label class="garage-field"><span>Fecha</span><input name="date" type="date" value="${today()}" required></label>
    <label class="garage-field"><span>Kilometraje</span><input name="mileage" type="number" min="0" inputmode="numeric" placeholder="${state.vehicle.mileage || ''}"></label>
    <label class="garage-field"><span>Coste (€)</span><input name="cost" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label class="garage-field garage-field-wide"><span>Síntomas</span><textarea name="description" rows="2" maxlength="4000" placeholder="Qué hacía el coche, cuándo y en qué condiciones"></textarea></label>
    <label class="garage-field"><span>Causa encontrada</span><textarea name="cause" rows="2" maxlength="2000" placeholder="Solo si se ha confirmado"></textarea></label>
    <label class="garage-field"><span>Comprobaciones realizadas</span><textarea name="checks" rows="2" maxlength="4000" placeholder="Pruebas, medidas, lecturas en vivo…"></textarea></label>
    <label class="garage-field garage-field-wide"><span>Piezas sustituidas / solución</span><textarea name="parts" rows="2" maxlength="2000" placeholder="Referencia o descripción de las piezas"></textarea></label>`;
  }

  function tabAverias() {
    const events = state.vehicle.events.filter(event => ['averia', 'reparacion', 'inspeccion'].includes(event.kind));
    return `
      <div class="garage-block">
        <h4>Registrar avería o reparación</h4>
        <p class="garage-note">Las causas son hipótesis hasta que se confirman con una comprobación. Separa siempre síntoma, comprobación y causa encontrada.</p>
        <form class="garage-form garage-event-form" data-form="event">
          <div class="garage-fields">${issueFields()}</div>
          <div class="garage-form-actions"><button class="btn primary sm" type="submit">Guardar registro</button></div>
        </form>
      </div>
      <div class="garage-block">
        <h4>Averías y reparaciones</h4>
        ${events.length ? `<div class="garage-events">${events.map(event => eventCard(event)).join('')}</div>` : '<p class="garage-empty-note">Sin averías registradas. Cuando tengas una, guárdala aquí con su DTC y las comprobaciones.</p>'}
        <div class="garage-form-actions">
          <button class="btn ghost sm" type="button" data-goto="diagnostico">${icon('pulse')} Abrir diagnóstico de la web</button>
        </div>
      </div>`;
  }

  function genericEventForm() {
    return `<div class="garage-block">
      <h4>Añadir al historial</h4>
      <p class="garage-note">ITV, inspecciones, modificaciones y gastos también forman parte del historial del coche.</p>
      <form class="garage-form garage-event-form" data-form="event">
        <div class="garage-fields">
          <label class="garage-field"><span>Tipo</span>
            <select name="kind">
              <option value="itv">ITV</option>
              <option value="inspeccion">Inspección de taller</option>
              <option value="modificacion">Modificación</option>
              <option value="gasto">Gasto (seguro, impuesto, multa…)</option>
            </select>
          </label>
          <label class="garage-field"><span>Título</span><input name="title" maxlength="120" placeholder="ITV favorable" required></label>
          <label class="garage-field"><span>Fecha</span><input name="date" type="date" value="${today()}" required></label>
          <label class="garage-field"><span>Kilometraje</span><input name="mileage" type="number" min="0" inputmode="numeric" placeholder="${state.vehicle.mileage || ''}"></label>
          <label class="garage-field"><span>Coste (€)</span><input name="cost" type="number" min="0" step="0.01" inputmode="decimal"></label>
          <label class="garage-field garage-field-wide"><span>Detalle</span><textarea name="description" rows="2" maxlength="4000" placeholder="Resultado, taller, observaciones…"></textarea></label>
        </div>
        <div class="garage-form-actions"><button class="btn primary sm" type="submit">Añadir al historial</button></div>
      </form>
    </div>`;
  }

  function tabHistorial() {
    const filter = state.historyFilter;
    const events = state.vehicle.events.filter(event => !filter || event.kind === filter);
    return `
      ${genericEventForm()}
      <div class="garage-block">
        <div class="garage-hist-head">
          <h4>Historial completo</h4>
          <label class="garage-field"><span>Filtrar</span>
            <select data-history-filter>
              <option value="">Todo</option>
              ${state.vehicle.eventKinds.map(kind => `<option value="${esc(kind.key)}"${filter === kind.key ? ' selected' : ''}>${esc(kind.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        ${events.length
          ? `<div class="garage-timeline">${events.map(event => `<div class="garage-timeline-row">
              <span class="garage-timeline-date">${dateLabel(event.date)}${event.mileage !== null ? `<small>${km(event.mileage)}</small>` : ''}</span>
              ${eventCard(event)}
            </div>`).join('')}</div>`
          : '<p class="garage-empty-note">No hay registros con ese filtro.</p>'}
      </div>`;
  }

  function tabDocumentos() {
    const documents = state.vehicle.documents;
    return `
      <div class="garage-block">
        <h4>Adjuntar documento privado</h4>
        <p class="garage-note">Solo tú puedes abrir estos archivos. Se guardan en el servidor de la aplicación y no se comparten.</p>
        <form class="garage-form" data-form="document">
          <div class="garage-fields">
            <label class="garage-field"><span>Tipo</span>
              <select name="kind">${state.vehicle.documentKinds.map(kind => `<option value="${esc(kind.key)}">${esc(kind.label)}</option>`).join('')}</select>
            </label>
            <label class="garage-field"><span>Nombre</span><input name="name" maxlength="120" placeholder="Factura revisión 2026"></label>
            <label class="garage-field garage-field-wide"><span>Archivo (JPG, PNG, WebP o PDF · máx. 8 MB)</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label>
          </div>
          <div class="garage-form-actions"><button class="btn primary sm" type="submit">Subir documento</button></div>
        </form>
      </div>
      <div class="garage-block">
        <h4>Documentación del vehículo</h4>
        ${documents.length ? `<div class="garage-documents">${documents.map(document => `
          <article class="garage-document">
            <span class="garage-doc-ico">${icon(document.mime === 'application/pdf' ? 'file' : 'image')}</span>
            <div>
              <b>${esc(document.name)}</b>
              <small>${esc(document.kindLabel)} · ${dateLabel(String(document.createdAt).slice(0, 10))} · ${Math.max(1, Math.round(document.size / 1024))} KB</small>
            </div>
            <a class="btn ghost sm" href="${esc(document.url)}" target="_blank" rel="noopener noreferrer">${icon('eye')} Abrir</a>
            <button class="garage-link danger" type="button" data-delete-doc="${document.id}">Eliminar</button>
          </article>`).join('')}</div>` : '<p class="garage-empty-note">Sin documentos. Adjunta la ficha técnica, facturas o informes de diagnosis.</p>'}
      </div>`;
  }

  function tabIA() {
    return `
      <div class="garage-block">
        <h4>Asistente IA de ${esc(state.vehicle.brand)} ${esc(state.vehicle.model)}</h4>
        <p class="garage-note">La IA recibe la ficha, el kilometraje y tu historial de este coche. Si falta un dato, debe decirlo; no se inventan averías ni precios.</p>
        <div class="garage-suggestions">
          ${['¿Qué mantenimiento me toca ahora?', '¿Qué averías he tenido y qué se cambió?', '¿Cuánto he gastado este año?', '¿Qué reparaciones tengo pendientes?', '¿Qué aceite necesita mi motor?']
            .map(question => `<button class="chip" type="button" data-ask="${esc(question)}">${esc(question)}</button>`).join('')}
        </div>
        <div class="garage-chat" id="garageChat">
          ${state.chat.length ? state.chat.map(message => `
            <div class="garage-bubble ${esc(message.role)}">${message.role === 'user' ? esc(message.text) : window.formatMarkdown(message.text)}</div>`).join('')
            : '<p class="garage-empty-note">Pregunta lo que quieras sobre este coche concreto.</p>'}
        </div>
        <form class="garage-ask" data-form="ai">
          <input name="message" maxlength="1500" placeholder="Pregunta sobre este coche…" aria-label="Pregunta al asistente" required>
          <button class="btn primary sm" type="submit">${icon('send')} Preguntar</button>
        </form>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Eventos y documentos: listeners y envíos
  // ----------------------------------------------------------------
  function bindTabPanel(box) {
    box.querySelector('[data-vin-toggle]')?.addEventListener('click', () => {
      state.showVin = !state.showVin;
      renderDetail();
    });
    box.querySelector('[data-history-filter]')?.addEventListener('change', event => {
      state.historyFilter = event.target.value;
      renderDetail();
    });
    box.querySelector('[data-goto]')?.addEventListener('click', () => {
      if (typeof window.showView === 'function') window.showView('diagnostico');
    });
    box.querySelectorAll('[data-ask]').forEach(button => button.addEventListener('click', () => {
      askAI(button.dataset.ask);
    }));
    box.querySelectorAll('[data-delete-event]').forEach(button => button.addEventListener('click', () => deleteEvent(Number(button.dataset.deleteEvent))));
    box.querySelectorAll('[data-edit-event]').forEach(button => button.addEventListener('click', () => startEditEvent(Number(button.dataset.editEvent))));
    box.querySelectorAll('[data-delete-doc]').forEach(button => button.addEventListener('click', () => deleteDocument(Number(button.dataset.deleteDoc))));

    box.querySelectorAll('[data-form="event"]').forEach(form => {
      form.addEventListener('submit', event => {
        event.preventDefault();
        submitEventForm(form);
      });
      const itemSelect = form.querySelector('select[name="item"]');
      const titleInput = form.querySelector('input[name="title"]');
      itemSelect?.addEventListener('change', () => {
        if (!titleInput || titleInput.dataset.touched === '1') return;
        const match = (state.vehicle.maintenanceItems || []).find(item => item.key === itemSelect.value);
        if (match) titleInput.value = match.label;
      });
      titleInput?.addEventListener('input', () => { titleInput.dataset.touched = '1'; });
    });

    box.querySelector('[data-form="document"]')?.addEventListener('submit', event => {
      event.preventDefault();
      submitDocument(event.target);
    });
    box.querySelector('[data-form="ai"]')?.addEventListener('submit', event => {
      event.preventDefault();
      const input = event.target.querySelector('input[name="message"]');
      const message = input?.value.trim();
      if (message) askAI(message);
    });
  }

  function formPayload(form) {
    const payload = {};
    new FormData(form).forEach((value, key) => {
      if (key === 'file') return;
      payload[key] = String(value).trim();
    });
    return payload;
  }

  async function submitEventForm(form) {
    const payload = formPayload(form);
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const editing = state.editingEvent;
      if (editing) {
        await api(`/api/garage/events/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        notify('Registro actualizado.', 'ok');
      } else {
        await api(`/api/garage/vehicles/${state.vehicle.id}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        notify('Registro guardado en el historial del coche.', 'ok');
      }
      state.editingEvent = null;
      await refreshDetail();
    } catch (error) {
      if (button) button.disabled = false;
      notify(error.message || 'No se pudo guardar el registro.', 'error');
    }
  }

  async function deleteEvent(id) {
    if (!window.confirm('¿Eliminar este registro del historial?')) return;
    try {
      await api(`/api/garage/events/${id}`, { method: 'DELETE' });
      await refreshDetail();
      notify('Registro eliminado.', 'ok');
    } catch (error) {
      notify(error.message || 'No se pudo eliminar el registro.', 'error');
    }
  }

  function startEditEvent(id) {
    const event = state.vehicle.events.find(item => item.id === id);
    if (!event) return;
    state.editingEvent = event;
    state.tab = ['mantenimiento'].includes(event.kind) ? 'mantenimiento' : 'averias';
    renderDetail();
    const panel = $('#garageTabPanel');
    const form = panel?.querySelector('[data-form="event"]');
    if (!form) return;
    for (const [key, value] of Object.entries({
      kind: event.kind === 'inspeccion' ? 'averia' : event.kind,
      title: event.title,
      item: event.item,
      dtc: event.dtc,
      date: event.date,
      mileage: event.mileage,
      cost: event.cost,
      description: event.description,
      cause: event.cause,
      checks: event.checks,
      parts: event.parts,
      nextDate: event.nextDate,
      nextMileage: event.nextMileage
    })) {
      const field = form.querySelector(`[name="${key}"]`);
      if (field && value !== null && value !== undefined) field.value = String(value);
    }
    form.insertAdjacentHTML('afterbegin', `<p class="garage-msg ok">Editando el registro del ${dateLabel(event.date)}. Al guardar se actualizará el historial.</p>`);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function submitDocument(form) {
    const file = form.querySelector('input[name="file"]')?.files?.[0];
    if (!file) return notify('Selecciona un archivo.', 'error');
    if (file.size > 8 * 1024 * 1024) return notify('El documento supera 8 MB.', 'error');
    const payload = formPayload(form);
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const dataUrl = await shrinkForStorage(file);
      await api(`/api/garage/vehicles/${state.vehicle.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, name: payload.name || file.name || 'documento', kind: payload.kind || 'otro' })
      });
      await refreshDetail();
      notify('Documento guardado en tu garaje privado.', 'ok');
    } catch (error) {
      if (button) button.disabled = false;
      notify(error.message || 'No se pudo subir el documento.', 'error');
    }
  }

  async function deleteDocument(id) {
    if (!window.confirm('¿Eliminar este documento? No se podrá recuperar.')) return;
    try {
      await api(`/api/garage/documents/${id}`, { method: 'DELETE' });
      await refreshDetail();
      notify('Documento eliminado.', 'ok');
    } catch (error) {
      notify(error.message || 'No se pudo eliminar el documento.', 'error');
    }
  }

  // ----------------------------------------------------------------
  // Asistente IA
  // ----------------------------------------------------------------
  async function askAI(question) {
    if (!state.vehicle || !question) return;
    state.chat.push({ role: 'user', text: question });
    state.chat.push({ role: 'assistant', text: 'Consultando el historial de tu coche…' });
    state.tab = 'ia';
    renderDetail();
    const chat = $('#garageChat');
    if (chat) chat.scrollTop = chat.scrollHeight;
    try {
      const context = { ...(state.aiContext || {}), vehicleId: '', garage: { ...(state.aiContext?.garage || {}), selectedVehicle: vehicleName(state.vehicle) } };
      const response = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, context })
      });
      const note = response.source === 'ai_provider' ? '' : '\n\n_Respuesta del motor experto local (sin proveedor de IA configurado)._';
      state.chat[state.chat.length - 1] = { role: 'assistant', text: `${response.reply || 'Sin respuesta.'}${note}` };
      renderDetail();
      const box = $('#garageChat');
      if (box) box.scrollTop = box.scrollHeight;
    } catch (error) {
      state.chat[state.chat.length - 1] = { role: 'assistant', text: `No se pudo consultar la IA: ${error.message}` };
      renderDetail();
    }
  }

  // ----------------------------------------------------------------
  // Ciclo de vida
  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Acceso directo desde la portada (foto de la ficha → IA)
  // ----------------------------------------------------------------
  let pendingFicha = null;
  let pendingManual = false;

  async function consumePendingAdd() {
    if (pendingFicha) {
      const file = pendingFicha;
      pendingFicha = null;
      openAdd();
      await scanFicha(file);
      return true;
    }
    if (pendingManual) {
      pendingManual = false;
      openAdd();
      renderVehicleForm({ mode: 'create' });
      return true;
    }
    return false;
  }

  $$('[data-garage-ficha]').forEach(input => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      pendingFicha = file;
      pendingManual = false;
      if (typeof window.showView === 'function') window.showView('garaje');
      else bootstrap();
    });
  });

  $$('[data-garage-manual]').forEach(button => button.addEventListener('click', () => {
    pendingManual = true;
    if (typeof window.showView === 'function') window.showView('garaje');
    else bootstrap();
  }));

  document.addEventListener('viewchange', event => {
    if (event.detail?.name === 'garaje') bootstrap();
  });

  if (location.hash === '#garaje') bootstrap();
})();
