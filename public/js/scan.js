(() => {
  const $ = selector => document.querySelector(selector);
  const MAX_BYTES = 12 * 1024 * 1024;
  const drop = $('#scanDrop');
  const fileInput = $('#scanFile');
  const cameraInput = $('#scanCamera');
  const manual = $('#scanManual');
  const statusBox = $('#scanStatus');
  const review = $('#scanReview');
  const fieldsBox = $('#scanFields');
  const warningsBox = $('#scanWarnings');
  const methodBox = $('#scanMethod');
  const confidenceTag = $('#scanConfidence');
  const aiBox = $('#scanAi');
  const aiText = $('#scanAiText');
  const aiMeta = $('#scanAiMeta');
  const askAiBtn = $('#scanAskAi');
  const continueBtn = $('#scanContinue');
  const clearBtn = $('#scanClear');
  let currentResult = null;
  let busy = false;
  let aiRequestId = 0;

  if (!drop || !review) return;

  const FIELD_DEFS = [
    ['brand', 'Marca'],
    ['model', 'Modelo'],
    ['generation', 'Generación'],
    ['year', 'Año'],
    ['vin', 'VIN'],
    ['engineCode', 'Código de motor'],
    ['displacementCc', 'Cilindrada (cc)'],
    ['powerPs', 'Potencia (CV)'],
    ['fuel', 'Combustible'],
    ['transmission', 'Cambio'],
    ['emissionStandard', 'Norma de emisiones']
  ];

  function setStatus(message = '', kind = 'info') {
    if (!statusBox) return;
    statusBox.hidden = !message;
    statusBox.textContent = message;
    statusBox.classList.toggle('error', kind === 'error');
  }

  function setBusy(value) {
    busy = value;
    drop.setAttribute('aria-busy', String(value));
    drop.classList.toggle('loading', value);
    const browse = $('#scanBrowse');
    if (browse) browse.disabled = value;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  function valueOf(item) {
    return item && item.value !== undefined && item.value !== null ? item.value : '';
  }

  function renderReview(result) {
    currentResult = result;
    if (!result || !result.extracted) return;
    fieldsBox.innerHTML = FIELD_DEFS.map(([key, label]) => {
      const item = result.extracted[key] || {};
      const value = valueOf(item);
      return `<label class="scan-field" data-confidence="${String(item.confidence || 'desconocida')}">
        <small>${label}</small>
        <input data-scan-field="${key}" value="${String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" placeholder="No detectado" autocomplete="off">
      </label>`;
    }).join('');
    fieldsBox.querySelectorAll('[data-scan-field]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.scanField;
        if (!currentResult?.extracted?.[key]) return;
        currentResult.extracted[key].value = input.value.trim();
        currentResult.extracted[key].confidence = input.value.trim() ? 'manual' : 'desconocida';
        input.closest('.scan-field').dataset.confidence = input.value.trim() ? 'manual' : 'desconocida';
      });
    });
    warningsBox.innerHTML = (result.warnings || []).map(warning => `<span>${String(warning).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('');
    if (aiBox) {
      const ai = result.ai || null;
      if (ai?.summary) {
        showAiSummary(ai);
      } else {
        requestAiSummary(result.extracted);
      }
    }
    const confidence = result.confidence || {};
    if (confidenceTag) {
      confidenceTag.textContent = `${String(confidence.overall || 'baja').toUpperCase()} · ${Number(confidence.score || 0)}%`;
      confidenceTag.className = `tag ${confidence.score >= 60 ? 'live-tag' : ''}`;
    }
    if (methodBox) {
      const methods = {
        imagen_ocr: 'Imagen leída con OCR local',
        pdf_text: 'Texto extraído del PDF',
        pdf_ocr: 'PDF escaneado leído con OCR local',
        texto_manual: 'Datos escritos manualmente',
        sin_texto: 'Sin texto'
      };
      methodBox.textContent = `${methods[confidence.method] || 'Análisis local'} · Revisa y corrige cualquier dato antes de continuar.`;
    }
    review.hidden = false;
  }

  function showAiSummary(ai) {
    if (!aiBox) return;
    const summary = String(ai?.summary || '').trim();
    if (!summary) {
      aiBox.hidden = true;
      return;
    }
    if (aiText) aiText.textContent = summary;
    if (aiMeta) aiMeta.textContent = `Generado por IA${(ai.provider_label || ai.provider) ? ` (${ai.provider_label || ai.provider})` : ''}. ${ai.notice || 'Revisa los datos antes de continuar.'}`;
    aiBox.hidden = false;
  }

  async function requestAiSummary(extracted) {
    const requestId = ++aiRequestId;
    if (!aiBox) return;
    aiBox.hidden = false;
    if (aiText) aiText.textContent = 'Analizando la ficha con IA…';
    if (aiMeta) aiMeta.textContent = 'Se enviará solo el texto extraído, sin matrícula ni VIN.';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/vehicle/scan/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== aiRequestId) return;
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
      if (data.ai?.summary) {
        showAiSummary(data.ai);
      } else {
        aiBox.hidden = true;
      }
    } catch (error) {
      if (requestId !== aiRequestId) return;
      if (aiText) aiText.textContent = 'La lectura IA no está disponible ahora mismo. Los datos extraídos siguen siendo válidos.';
      if (aiMeta) aiMeta.textContent = 'Puedes continuar al diagnóstico o preguntar al asistente.';
    } finally {
      clearTimeout(timer);
    }
  }

  async function analyze(payload, label = 'Analizando documento…') {
    if (busy) return;
    setBusy(true);
    setStatus(`${label} Esto puede tardar unos segundos si el archivo es una imagen o un PDF escaneado.`);
    try {
      const response = await fetch('/api/vehicle/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
      renderReview(data);
      setStatus('Datos preparados. Confirma el vehículo para continuar.');
    } catch (error) {
      review.hidden = true;
      currentResult = null;
      aiRequestId += 1;
      if (aiBox) aiBox.hidden = true;
      setStatus(error.message || 'No se pudo analizar el documento.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file) {
    if (!file || busy) return;
    if (!/^(image\/jpeg|image\/png|image\/webp|application\/pdf)$/i.test(file.type || '')) {
      setStatus('Formato no admitido. Usa JPG, PNG, WebP o PDF.', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus('El archivo supera el límite de 12 MB.', 'error');
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      await analyze({
        dataBase64: dataUrl,
        mimeType: file.type,
        fileName: file.name
      });
    } catch (error) {
      setStatus(error.message || 'No se pudo leer el archivo.', 'error');
    }
  }

  drop.addEventListener('click', event => {
    if (busy || event.target.closest('button')) return;
    fileInput?.click();
  });
  drop.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });
  $('#scanBrowse')?.addEventListener('click', () => fileInput?.click());
  $('#scanCameraBtn')?.addEventListener('click', () => cameraInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) handleFile(file);
  });
  cameraInput?.addEventListener('change', () => {
    const file = cameraInput.files?.[0];
    cameraInput.value = '';
    if (file) handleFile(file);
  });

  for (const eventName of ['dragenter', 'dragover']) {
    drop.addEventListener(eventName, event => {
      event.preventDefault();
      if (!busy) drop.classList.add('dragover');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    drop.addEventListener(eventName, event => {
      event.preventDefault();
      drop.classList.remove('dragover');
    });
  }
  drop.addEventListener('drop', event => {
    handleFile(event.dataTransfer?.files?.[0]);
  });

  manual?.addEventListener('submit', event => {
    event.preventDefault();
    const brand = $('#scanBrand')?.value.trim() || '';
    const model = $('#scanModel')?.value.trim() || '';
    const year = $('#scanYear')?.value.trim() || '';
    const engine = $('#scanEngine')?.value.trim() || '';
    const vin = $('#scanVin')?.value.trim() || '';
    if (!brand || !model) {
      setStatus('Indica al menos la marca y el modelo.', 'error');
      return;
    }
    if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      setStatus('El VIN debe tener 17 caracteres y no puede contener I, O ni Q.', 'error');
      return;
    }
    analyze({
      text: [
        `Marca: ${brand}`,
        `Modelo: ${model}`,
        year ? `Año: ${year}` : '',
        engine ? `Motorización: ${engine}` : '',
        vin ? `VIN: ${vin}` : ''
      ].filter(Boolean).join('\n')
    }, 'Validando datos manuales…');
  });

  function applyResultVehicle() {
    if (!currentResult?.extracted) return null;
    const get = key => valueOf(currentResult.extracted[key]).toString().trim();
    const brand = get('brand');
    const model = get('model');
    if (!brand || !model) {
      setStatus('Faltan la marca o el modelo. Corrígelos antes de continuar.', 'error');
      const target = fieldsBox.querySelector(`[data-scan-field="${!brand ? 'brand' : 'model'}"]`);
      target?.focus();
      return null;
    }
    const engine = [
      get('engineCode'),
      get('displacementCc') ? `${get('displacementCc')} cc` : '',
      get('powerPs') ? `${get('powerPs')} CV` : '',
      get('fuel'),
      get('transmission')
    ].filter(Boolean).join(' · ');

    const vehicle = { id: currentResult.linkedVehicleId || '', brand, model, engine };
    const ok = typeof window.setVehicleState === 'function'
      ? window.setVehicleState(vehicle, 'scan')
      : false;
    if (!ok) {
      setStatus('No se pudo aplicar el vehículo al diagnóstico.', 'error');
      return null;
    }
    const yearInput = $('#fYear');
    if (yearInput && get('year')) yearInput.value = get('year');
    return { ...vehicle, year: get('year') };
  }

  continueBtn?.addEventListener('click', () => {
    const vehicle = applyResultVehicle();
    if (!vehicle) return;
    setStatus(`Vehículo aplicado: ${[vehicle.brand, vehicle.model, vehicle.engine].filter(Boolean).join(' ')}.`);
    if (typeof window.showView === 'function') window.showView('diagnostico');
  });

  askAiBtn?.addEventListener('click', () => {
    const vehicle = applyResultVehicle();
    if (!vehicle) return;
    const label = [vehicle.brand, vehicle.model, vehicle.engine, vehicle.year ? `(${vehicle.year})` : ''].filter(Boolean).join(' ');
    setStatus(`Vehículo aplicado: ${label}.`);
    if (typeof window.showView === 'function') window.showView('chat');
    const input = $('#chatInput');
    if (input) {
      input.value = `He escaneado la documentación de mi ${label}. ¿Qué averías o síntomas debo vigilar y qué comprobaciones hago primero?`;
      input.focus();
    }
  });

  clearBtn?.addEventListener('click', () => {
    currentResult = null;
    aiRequestId += 1;
    review.hidden = true;
    if (fieldsBox) fieldsBox.innerHTML = '';
    if (warningsBox) warningsBox.innerHTML = '';
    if (aiBox) {
      aiBox.hidden = true;
      if (aiText) aiText.textContent = '';
      if (aiMeta) aiMeta.textContent = '';
    }
    setStatus('');
    manual?.reset();
    fileInput && (fileInput.value = '');
    cameraInput && (cameraInput.value = '');
  });
})();
