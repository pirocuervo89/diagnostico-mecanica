(() => {
  const $ = selector => document.querySelector(selector);
  const MAX_BYTES = 12 * 1024 * 1024;
  // Una foto de móvil puede pesar más de 12 MB antes de reducirla; no se
  // rechaza por el tamaño original, solo por el resultado ya preparado.
  const MAX_RAW_IMAGE_BYTES = 50 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 2000;
  const IMAGE_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif'
  };
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

  function detectFileType(file) {
    const name = String(file?.name || '');
    const ext = (name.split('.').pop() || '').toLowerCase();
    let type = String(file?.type || '').toLowerCase();
    if (!type || type === 'application/octet-stream') type = IMAGE_BY_EXT[ext] || type;
    if (type === 'image/jpg') type = 'image/jpeg';
    return {
      type,
      ext,
      isPdf: type === 'application/pdf' || ext === 'pdf',
      isImage: type.startsWith('image/') || Boolean(IMAGE_BY_EXT[ext])
    };
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
      } catch (_) { /* Safari/Android antiguos: se intenta con Image */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(Object.assign(new Error('Esta foto no se puede leer en este navegador. Hazla de nuevo en JPG o súbela como PDF.'), { code: 'decode' }));
        img.src = url;
      });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo preparar la foto. Prueba con otra imagen.'));
      }, 'image/jpeg', 0.85);
    });
  }

  // HEIC, fotos de 48 MP y archivos sin MIME se convierten aquí a un JPEG
  // ligero. Así el OCR recibe siempre una imagen válida y manejable.
  async function prepareImage(file) {
    const decoded = await decodeImage(file);
    try {
      if (!decoded.width || !decoded.height) throw new Error('La foto está vacía o no tiene una imagen legible.');
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo preparar la foto en este navegador.');
      // Fondo blanco: evita que un PNG con transparencia se convierta en negro.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, width, height);
      const blob = await canvasToJpeg(canvas);
      const base = String(file.name || 'ficha-tecnica').replace(/\.[^.]+$/, '') || 'ficha-tecnica';
      return { blob, name: `${base}.jpg` };
    } finally {
      decoded.close();
    }
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
    const info = detectFileType(file);

    // PDF: se manda tal cual, con su límite real.
    if (info.isPdf) {
      if (file.size > MAX_BYTES) {
        setStatus('El PDF supera el límite de 12 MB.', 'error');
        return;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        await analyze({
          dataBase64: dataUrl,
          mimeType: 'application/pdf',
          fileName: file.name || 'ficha-tecnica.pdf'
        });
      } catch (error) {
        setStatus(error.message || 'No se pudo leer el PDF.', 'error');
      }
      return;
    }

    if (!info.isImage) {
      setStatus('Formato no admitido. Usa una foto JPG, PNG, WebP, HEIC o un PDF.', 'error');
      return;
    }
    if (file.size > MAX_RAW_IMAGE_BYTES) {
      setStatus('La foto es demasiado grande (máximo 50 MB). Prueba con otra o hazla de nuevo.', 'error');
      return;
    }

    // La imagen se reduce antes de enviarla. Así una foto de 48 MP o un HEIC
    // que el navegador sepa abrir no rebota por el límite de 12 MB.
    setBusy(true);
    setStatus('Preparando la foto…');
    try {
      const prepared = await prepareImage(file);
      if (prepared.blob.size > MAX_BYTES) {
        throw new Error('La foto sigue superando 12 MB después de reducirla. Prueba con otra imagen.');
      }
      const dataUrl = await readAsDataUrl(prepared.blob);
      setBusy(false);
      await analyze({
        dataBase64: dataUrl,
        mimeType: 'image/jpeg',
        fileName: prepared.name
      }, 'Leyendo la ficha técnica…');
    } catch (error) {
      setBusy(false);
      setStatus(error.message || 'No se pudo preparar la foto. Prueba con otra imagen.', 'error');
    }
  }

  // El selector abierto desde la cámara puede entregar HEIC o un tipo vacío;
  // el filtro de archivos debe dejar pasar cualquier imagen y el PDF.
  if (fileInput) fileInput.accept = 'image/*,application/pdf';

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
