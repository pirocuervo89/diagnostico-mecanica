(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const DTC_RE = /^[PBCU]\d{4}$/i;

  const FALLBACK = [
    { id: 'chirrido-o-ruido-metalico-al-frenar', name: 'Chirrido o ruido metálico al frenar', urgency: 'Alta' },
    { id: 'el-motor-ratea-y-el-testigo-de-motor-parpadea', name: 'El motor ratea y el testigo de motor parpadea', urgency: 'Alta' },
    { id: 'el-motor-gira-pero-no-arranca-y-no-hay', name: 'El motor gira pero no arranca', urgency: 'Muy alta' },
    { id: 'el-escape-echa-humo-blanco-solo-al-ralenti-prolongado', name: 'El escape echa humo blanco', urgency: 'Media' },
    { id: 'el-vehiculo-se-va-hacia-un-lado-al-frenar', name: 'El vehículo se va hacia un lado al frenar', urgency: 'Muy alta' },
    { id: 'el-motor-tiene-un-ruido-de-golpeteo-profundo-que', name: 'Golpeteo profundo en el motor', urgency: 'Muy alta' }
  ];

  const state = {
    symptoms: [],
    selected: null,
    mode: 'symptom',
    car: '',
    when: '',
    warning: '',
    fromUrl: false,
    loading: false
  };

  const els = {
    form: $('#dg-form'),
    car: $('#dg-car'),
    q: $('#dg-q'),
    suggest: $('#dg-suggest'),
    hint: $('#dg-hint'),
    chips: $('#dg-chips'),
    step: $('#dg-step'),
    stepSymptom: $('#dg-step-symptom'),
    stepCar: $('#dg-step-car'),
    when: $('#dg-when'),
    warning: $('#dg-warning'),
    next: $('#dg-next'),
    result: $('#dg-result'),
    resultCase: $('#dg-result-case'),
    resultVerdict: $('#dg-result-verdict'),
    resultName: $('#dg-result-name'),
    resultDesc: $('#dg-result-desc'),
    causes: $('#dg-causes'),
    checks: $('#dg-checks'),
    dtcBlock: $('#dg-dtc-block'),
    dtcs: $('#dg-dtcs'),
    wa: $('#dg-wa'),
    copy: $('#dg-copy'),
    share: $('#dg-share'),
    shareStatus: $('#dg-share-status'),
    honest: $('#dg-honest'),
    reset: $('#dg-reset')
  };

  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function fold(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function terms(query) {
    return fold(query).split(/\s+/).filter(term => term.length > 1).slice(0, 8);
  }

  function urgencyInfo(urgency) {
    const u = fold(urgency);
    if (u.includes('muy alta')) {
      return {
        className: 'dg-verdict-high',
        title: 'Riesgo muy alto',
        text: 'No circules. Detén el coche en un lugar seguro y revisa el sistema.',
        short: 'NO CIRCULES'
      };
    }
    if (u.includes('alta')) {
      return {
        className: 'dg-verdict-high',
        title: 'Riesgo alto',
        text: 'No circules hasta confirmar la causa. Puede afectar a la seguridad o al motor.',
        short: 'RIESGO ALTO'
      };
    }
    if (u.includes('media')) {
      return {
        className: '',
        title: 'Riesgo medio',
        text: 'Puedes circular con precaución hasta el taller, vigilando el síntoma.',
        short: 'PRECAUCIÓN'
      };
    }
    return {
      className: 'dg-verdict-low',
      title: 'Riesgo bajo',
      text: 'Vigila el síntoma y revísalo esta semana. Si empeora, para el coche.',
      short: 'VIGILAR'
    };
  }

  function severityFromDtc(severity) {
    const s = fold(severity);
    if (s.includes('muy') || s.includes('critic')) return 'Muy alta';
    if (s.includes('alta')) return 'Alta';
    if (s.includes('media')) return 'Media';
    return 'Baja';
  }

  function scoreSymptom(symptom, query) {
    const q = fold(query);
    const list = terms(query);
    if (!q || !list.length) return 0;
    const name = fold(symptom.name);
    const description = fold(symptom.description);
    const category = fold(`${symptom.category || ''} ${symptom.system || ''} ${symptom.area || ''}`);
    let score = 0;
    if (name === q) score += 120;
    if (name.startsWith(q)) score += 50;
    if (name.includes(q)) score += 40;
    if (description.includes(q)) score += 20;
    for (const term of list) {
      if (name.includes(term)) score += 12;
      else if (description.includes(term)) score += 5;
      else if (category.includes(term)) score += 3;
      else score -= 8;
    }
    return score;
  }

  function loadSymptoms() {
    return fetch('/api/symptoms?lite=1', { headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('No se pudo cargar la base de síntomas');
        return response.json();
      })
      .then(list => {
        state.symptoms = Array.isArray(list) ? list : [];
        return state.symptoms;
      })
      .catch(() => {
        state.symptoms = FALLBACK.slice();
        if (els.hint) els.hint.textContent = 'No hemos podido cargar el buscador completo. Puedes usar los síntomas frecuentes.';
        return state.symptoms;
      });
  }

  function renderSuggestions(query) {
    if (!els.suggest) return;
    const q = String(query || '').trim();
    if (!q) {
      els.suggest.hidden = true;
      return;
    }
    if (DTC_RE.test(q)) {
      els.suggest.innerHTML = `<button type="button" data-dtc="${esc(q.toUpperCase())}">
        <b>Buscar código ${esc(q.toUpperCase())}</b>
        <small>Leer definición, causas y comprobaciones del DTC</small>
        <span class="dg-sug-urg dg-lik">DTC</span>
      </button>`;
      els.suggest.hidden = false;
      return;
    }
    const found = state.symptoms
      .map(symptom => ({ symptom, score: scoreSymptom(symptom, q) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);
    if (!found.length) {
      els.suggest.innerHTML = `<div style="padding:12px;color:#a5a2c8;font-size:12px">No encontramos ese síntoma. Prueba con otras palabras o escribe un código DTC.</div>`;
      els.suggest.hidden = false;
      return;
    }
    els.suggest.innerHTML = found.map(({ symptom }) => {
      const info = urgencyInfo(symptom.urgency);
      return `<button type="button" data-symptom="${esc(symptom.id)}">
        <b>${esc(symptom.name)}</b>
        <small>${esc(symptom.category || symptom.system || 'Diagnóstico')}</small>
        <span class="dg-sug-urg dg-lik${fold(symptom.urgency).includes('muy') || fold(symptom.urgency).includes('alta') ? ' frecuente' : ''}">${esc(info.short)}</span>
      </button>`;
    }).join('');
    els.suggest.hidden = false;
  }

  function hideSuggestions() {
    if (els.suggest) els.suggest.hidden = true;
  }

  function setActive(group, attribute, value) {
    $$(`[${attribute}]`, group).forEach(button => {
      button.classList.toggle('is-on', button.getAttribute(attribute) === value);
    });
  }

  function fillStepSummary() {
    if (!state.selected) return;
    if (els.stepSymptom) els.stepSymptom.textContent = state.selected.name;
    if (els.stepCar) els.stepCar.textContent = state.car ? state.car : 'Sin coche indicado';
    setActive(els.when, 'data-when', state.when);
    setActive(els.warning, 'data-warning', state.warning);
  }

  function showStep() {
    if (!els.step) return;
    fillStepSummary();
    els.step.hidden = false;
    if (els.result) els.result.hidden = true;
    els.step.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function normalizeSymptom(raw) {
    const name = raw.name || raw.sintoma || raw.n || raw.id;
    const causes = Array.isArray(raw.causeDetails) && raw.causeDetails.length
      ? raw.causeDetails
      : (Array.isArray(raw.commonCauses) ? raw.commonCauses : []);
    const checks = Array.isArray(raw.quickChecks) ? raw.quickChecks : [];
    return {
      id: raw.id,
      mode: 'symptom',
      name,
      description: raw.description || raw.descripcion || '',
      urgency: raw.urgency || 'Media',
      driveRisk: raw.driveRisk || '',
      causes,
      checks,
      dtcs: Array.isArray(raw.relatedDtc) ? raw.relatedDtc : (Array.isArray(raw.dtc) ? raw.dtc : []),
      tools: Array.isArray(raw.tools) ? raw.tools : [],
      system: raw.system || raw.category || raw.area || ''
    };
  }

  function normalizeDtc(raw, code) {
    const causes = Array.isArray(raw.causes) ? raw.causes : [];
    const checks = Array.isArray(raw.checks) ? raw.checks : [];
    return {
      id: code,
      mode: 'dtc',
      name: `Código ${code} · ${raw.title || 'Avería registrada'}`,
      description: raw.description || 'La ECU ha registrado este código de avería.',
      urgency: severityFromDtc(raw.severity),
      driveRisk: '',
      causes,
      checks,
      dtcs: [code],
      tools: [],
      system: raw.system || 'Diagnóstico'
    };
  }

  function selectSymptom(id, options = {}) {
    if (!id || state.loading) return;
    state.loading = true;
    if (els.hint) els.hint.textContent = 'Buscando el síntoma…';
    fetch(`/api/symptoms/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Síntoma no encontrado');
        return response.json();
      })
      .then(raw => {
        state.selected = normalizeSymptom(raw);
        state.mode = 'symptom';
        state.fromUrl = Boolean(options.fromUrl);
        hideSuggestions();
        if (els.hint) els.hint.textContent = 'También puedes escribir un código DTC, por ejemplo P0300.';
        if (options.fromUrl) {
          showResult();
        } else {
          showStep();
        }
      })
      .catch(() => {
        if (els.hint) els.hint.textContent = 'No hemos podido abrir ese síntoma. Prueba con otro.';
      })
      .finally(() => {
        state.loading = false;
      });
  }

  function selectDtc(code, options = {}) {
    const clean = String(code || '').toUpperCase();
    if (!DTC_RE.test(clean) || state.loading) return;
    state.loading = true;
    if (els.hint) els.hint.textContent = `Buscando el código ${clean}…`;
    fetch(`/api/dtc/${encodeURIComponent(clean)}`, { headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Código no encontrado');
        return response.json();
      })
      .then(raw => {
        state.selected = normalizeDtc(raw, clean);
        state.mode = 'dtc';
        state.fromUrl = Boolean(options.fromUrl);
        hideSuggestions();
        if (els.hint) els.hint.textContent = 'También puedes describir el síntoma con tus palabras.';
        if (options.fromUrl) {
          showResult();
        } else {
          showStep();
        }
      })
      .catch(() => {
        if (els.hint) els.hint.textContent = `No encontramos el código ${clean}. Comprueba que esté bien escrito.`;
      })
      .finally(() => {
        state.loading = false;
      });
  }

  function causeParts(cause) {
    if (typeof cause === 'string') return { likelihood: 'posible', text: cause };
    return {
      likelihood: cause.likelihood || 'posible',
      text: cause.text || cause.causa || ''
    };
  }

  function checkText(check) {
    if (typeof check === 'string') return check;
    return check.text || check.check || '';
  }

  function renderResult() {
    const data = state.selected;
    if (!data) return;
    state.car = String(els.car?.value || '').trim().slice(0, 80);
    state.when = state.when || '';
    state.warning = state.warning || '';

    const info = urgencyInfo(data.urgency);
    const caseBits = [state.car, state.when, state.warning].filter(Boolean);

    if (els.resultCase) {
      els.resultCase.textContent = caseBits.length ? caseBits.join(' · ') : 'Sin datos adicionales del vehículo';
    }
    if (els.resultVerdict) {
      els.resultVerdict.className = `dg-verdict ${info.className}`.trim();
      els.resultVerdict.innerHTML = `<span class="dg-verdict-ico">!</span>
        <div><b>${esc(info.title)}</b><small>${esc(data.driveRisk || info.text)}</small></div>`;
    }
    if (els.resultName) els.resultName.textContent = data.name;
    if (els.resultDesc) els.resultDesc.textContent = data.description || 'Revisa las causas y comprobaciones antes de cambiar ninguna pieza.';

    const causes = data.causes.slice(0, 6).map(causeParts).filter(item => item.text);
    if (els.causes) {
      els.causes.innerHTML = causes.length
        ? causes.map(item => {
          const tag = fold(item.likelihood);
          const className = tag.includes('confirm') ? 'confirmada' : (tag.includes('frecu') ? 'frecuente' : '');
          return `<li><span class="dg-lik ${className}">${esc(item.likelihood)}</span><span>${esc(item.text)}</span></li>`;
        }).join('')
        : '<li><span class="dg-lik">revisar</span><span>Inspección física del sistema afectado.</span></li>';
    }

    const checks = data.checks.map(checkText).filter(Boolean).slice(0, 6);
    if (els.checks) {
      els.checks.innerHTML = checks.length
        ? checks.map(text => `<li>${esc(text)}</li>`).join('')
        : '<li>Lectura de códigos DTC y comprobación física del sistema.</li>';
    }

    const dtcs = Array.from(new Set(data.dtcs.filter(Boolean).map(code => String(code).toUpperCase())));
    if (els.dtcBlock) els.dtcBlock.hidden = dtcs.length === 0;
    if (els.dtcs) {
      els.dtcs.innerHTML = dtcs.map(code => `<button type="button" data-result-dtc="${esc(code)}">${esc(code)}</button>`).join('');
    }

    if (els.honest) {
      els.honest.textContent = info.className === 'dg-verdict-high'
        ? 'Por la gravedad indicada, no circules y confirma la avería con una inspección física.'
        : 'Esto no es un diagnóstico definitivo. Es una brújula para no ir a ciegas al taller.';
    }

    els.result.hidden = false;
    if (state.fromUrl) document.body.classList.add('dg-shared');
    document.title = `${data.name.slice(0, 70)} · Diagnóstico gratis`;
    updateUrl();
    updateShare();
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showResult() {
    if (!state.selected) return;
    renderResult();
  }

  function updateUrl() {
    if (!state.selected) return;
    const params = new URLSearchParams();
    if (state.mode === 'dtc') params.set('dtc', state.selected.id);
    else params.set('s', state.selected.id);
    if (state.car) params.set('coche', state.car);
    if (state.when) params.set('cuando', state.when);
    if (state.warning) params.set('testigo', state.warning);
    const url = `${location.pathname}?${params.toString()}`;
    history.replaceState(null, '', url);
  }

  function shareText() {
    if (!state.selected) return 'Diagnóstico gratis en 30 segundos';
    const info = urgencyInfo(state.selected.urgency);
    return `${state.selected.name}: ${info.title}. Diagnóstico gratis en 30 segundos, sin registro:`;
  }

  function updateShare() {
    const url = location.href;
    const text = shareText();
    if (els.wa) els.wa.href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    if (els.shareStatus) els.shareStatus.textContent = '';
  }

  async function copyLink() {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      if (els.shareStatus) els.shareStatus.textContent = 'Enlace copiado.';
    } catch {
      const temp = document.createElement('textarea');
      temp.value = url;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
      if (els.shareStatus) els.shareStatus.textContent = 'Enlace copiado.';
    }
  }

  async function nativeShare() {
    if (!state.selected) return;
    const payload = { title: 'Diagnóstico gratis · Diagnóstico y Mecánica', text: shareText(), url: location.href };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        if (els.shareStatus) els.shareStatus.textContent = 'Compartido.';
      } catch {
        if (els.shareStatus) els.shareStatus.textContent = 'No se completó la acción.';
      }
      return;
    }
    copyLink();
  }

  function reset() {
    state.selected = null;
    state.mode = 'symptom';
    state.when = '';
    state.warning = '';
    state.fromUrl = false;
    document.body.classList.remove('dg-shared');
    document.title = 'Diagnóstico gratis en 30 segundos · ¿Puedo conducir?';
    if (els.step) els.step.hidden = true;
    if (els.result) els.result.hidden = true;
    if (els.suggest) els.suggest.hidden = true;
    if (els.q) els.q.value = '';
    if (els.hint) els.hint.textContent = 'También puedes escribir un código DTC, por ejemplo P0300.';
    history.replaceState(null, '', location.pathname);
    if (els.form) els.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (els.q) setTimeout(() => els.q.focus(), 250);
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const symptomId = params.get('s');
    const dtc = params.get('dtc');
    const car = params.get('coche');
    const when = params.get('cuando');
    const warning = params.get('testigo');
    if (car && els.car) els.car.value = car;
    state.car = car || '';
    state.when = when || '';
    state.warning = warning || '';
    if (!symptomId && !dtc) return;
    if (dtc) {
      selectDtc(dtc, { fromUrl: true });
      return;
    }
    selectSymptom(symptomId, { fromUrl: true });
  }

  function init() {
    if (!els.form || !els.q) return;
    loadSymptoms().then(restoreFromUrl);

    let timer = null;
    els.q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => renderSuggestions(els.q.value), 120);
    });

    els.q.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideSuggestions();
    });

    document.addEventListener('click', event => {
      if (!els.suggest) return;
      if (!els.suggest.contains(event.target) && event.target !== els.q) hideSuggestions();
    });

    els.suggest?.addEventListener('click', event => {
      const symptomButton = event.target.closest('[data-symptom]');
      if (symptomButton) {
        selectSymptom(symptomButton.dataset.symptom);
        return;
      }
      const dtcButton = event.target.closest('[data-dtc]');
      if (dtcButton) selectDtc(dtcButton.dataset.dtc);
    });

    els.form.addEventListener('submit', event => {
      event.preventDefault();
      const query = String(els.q.value || '').trim();
      if (!query) {
        renderSuggestions('');
        els.q.focus();
        return;
      }
      if (DTC_RE.test(query)) {
        selectDtc(query);
        return;
      }
      const best = state.symptoms
        .map(symptom => ({ symptom, score: scoreSymptom(symptom, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (best) {
        selectSymptom(best.symptom.id);
        return;
      }
      renderSuggestions(query);
      if (els.hint) els.hint.textContent = 'No encontramos ese síntoma. Prueba con otras palabras o un código DTC.';
    });

    els.chips?.addEventListener('click', event => {
      const button = event.target.closest('[data-demo]');
      if (button) selectSymptom(button.dataset.demo);
    });

    $$('.dg-case').forEach(button => {
      button.addEventListener('click', () => selectSymptom(button.dataset.demo));
    });

    els.when?.addEventListener('click', event => {
      const button = event.target.closest('[data-when]');
      if (!button) return;
      state.when = button.dataset.when;
      setActive(els.when, 'data-when', state.when);
    });

    els.warning?.addEventListener('click', event => {
      const button = event.target.closest('[data-warning]');
      if (!button) return;
      state.warning = button.dataset.warning;
      setActive(els.warning, 'data-warning', state.warning);
    });

    els.next?.addEventListener('click', () => {
      state.car = String(els.car?.value || '').trim().slice(0, 80);
      showResult();
    });

    els.dtcs?.addEventListener('click', event => {
      const button = event.target.closest('[data-result-dtc]');
      if (button) selectDtc(button.dataset.resultDtc);
    });

    els.copy?.addEventListener('click', copyLink);
    els.share?.addEventListener('click', nativeShare);
    els.reset?.addEventListener('click', reset);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
