/* Foro de Mecánicos · interfaz y persistencia */
(function () {
  const $f = s => document.querySelector(s);
  const $$f = s => [...document.querySelectorAll(s)];

  const state = {
    user: null,
    categories: [],
    categoryMap: new Map(),
    cases: [],
    total: 0,
    offset: 0,
    limit: 20,
    filters: { q: '', category: '', status: '', days: '', sort: 'relevancia' },
    currentCase: null,
    currentView: 'list',
    files: [],
    threads: [],
    activeThread: null,
    activeProfile: null,
    moderation: [],
    loaded: false,
    busy: false,
    replyParent: null,
    replyToName: '',
    skipNextListLoad: false
  };

  const statusLabels = {
    abierto: 'Abierto',
    investigacion: 'En investigación',
    solucion_propuesta: 'Solución propuesta',
    solucion_verificada: 'Solución verificada',
    cerrado: 'Cerrado'
  };

  function el(id) { return document.getElementById(id); }
  function num(n) { return Number(n || 0).toLocaleString('es-ES'); }
  function statusLabel(status) { return statusLabels[status] || status; }
  function categoryName(id) { return state.categoryMap.get(id) || id; }
  function initials(name = '') {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  }
  function safeColor(color) {
    return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#f39c12';
  }
  function avatar(author, cls = '') {
    return `<span class="forum-avatar ${cls}" style="background:linear-gradient(145deg,${safeColor(author?.avatarColor)},#1a1f26)">${esc(initials(author?.displayName || author?.username))}</span>`;
  }
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function parseDtcs(value) {
    return String(value || '').split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(s => /^[PBCU][0-9A-F]{4}$/.test(s)).slice(0, 30);
  }
  function statusBadge(status) {
    return `<span class="forum-status ${esc(status)}">${esc(statusLabel(status))}</span>`;
  }
  function emptyState(title, text) {
    return `<div class="forum-empty">${icon('forum')}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  }
  function loading() {
    return `<div class="forum-loading" aria-label="Cargando"><span></span><span></span><span></span></div>`;
  }
  function globalStatus(message, type = '') {
    const box = el('forumGlobalStatus');
    if (!box) return;
    box.className = `form-status ${type}`.trim();
    box.textContent = message || '';
  }
  function authStatus(message, type = '') {
    const box = el('forumAuthStatus');
    if (!box) return;
    box.className = `form-status ${type}`.trim();
    box.textContent = message || '';
  }
  function editorStatus(message, type = '') {
    const box = el('forumEditorStatus');
    if (!box) return;
    box.className = `form-status ${type}`.trim();
    box.textContent = message || '';
  }
  function requireLogin(message = 'Inicia sesión para continuar.') {
    globalStatus(message, 'error');
    const panel = el('forumAuthPanel');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el('forumLoginUser')?.focus();
  }
  function jsonPost(url, body, method = 'POST') {
    return api(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }
  function showPane(name) {
    state.currentView = name;
    const section = el('view-foro');
    if (section) section.dataset.pane = name;
    const map = {
      list: 'forumListView',
      case: 'forumCaseView',
      editor: 'forumEditor',
      messages: 'forumMessagesView',
      profile: 'forumProfileView',
      moderation: 'forumModerationView'
    };
    for (const [key, id] of Object.entries(map)) el(id)?.classList.toggle('hidden', key !== name);
  }

  function renderAuth() {
    const signedOut = el('forumAuthSignedOut');
    const signedIn = el('forumAuthSignedIn');
    const modBtn = el('forumModerationBtn');
    if (!signedOut || !signedIn) return;
    signedOut.classList.toggle('hidden', Boolean(state.user));
    signedIn.classList.toggle('hidden', !state.user);
    if (!state.user) return;
    el('forumUserName').textContent = state.user.displayName || state.user.username;
    el('forumUserRole').textContent = state.user.role;
    el('forumUserRep').textContent = num(state.user.reputation);
    const av = el('forumUserAvatar');
    av.textContent = initials(state.user.displayName || state.user.username);
    av.style.background = `linear-gradient(145deg,${safeColor(state.user.avatarColor)},#1a1f26)`;
    modBtn?.classList.toggle('hidden', !['admin', 'moderator'].includes(state.user.role));
  }

  async function loadAuth() {
    try {
      const res = await api('/api/forum/auth/me');
      state.user = res.user || null;
    } catch {
      state.user = null;
    }
    renderAuth();
  }

  function fillCategorySelects() {
    const options = state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const filter = el('forumCategoryFilter');
    const editor = el('forumCaseCategory');
    if (filter) filter.innerHTML = `<option value="">Todas las categorías</option>${options}`;
    if (editor) editor.innerHTML = options;
  }

  function renderCategoryList() {
    const box = el('forumCatList');
    if (!box) return;
    box.innerHTML = state.categories.map(c => `
      <button type="button" data-category="${esc(c.id)}" class="${state.filters.category === c.id ? 'active' : ''}">
        <span>${esc(c.name)}</span><span>${num(c.cases)}</span>
      </button>`).join('');
  }

  async function loadCategories() {
    const res = await api('/api/forum/categories');
    state.categories = res.categories || [];
    state.categoryMap = new Map(state.categories.map(c => [c.id, c.name]));
    fillCategorySelects();
    renderCategoryList();
  }

  async function loadStats() {
    try {
      const stats = await api('/api/forum/stats');
      const box = el('forumStatsMini');
      if (box) box.innerHTML = `
        <div><b>${num(stats.cases)}</b><span>Casos</span></div>
        <div><b>${num(stats.solved)}</b><span>Verificados</span></div>
        <div><b>${num(stats.replies)}</b><span>Respuestas</span></div>
        <div><b>${num(stats.users)}</b><span>Mecánicos</span></div>`;
    } catch { /* el foro sigue siendo visible si falla el contador */ }
  }

  function caseCard(item) {
    const vehicle = [item.vehicle.brand, item.vehicle.model, item.vehicle.year, item.vehicle.engine].filter(Boolean).join(' · ');
    const dtcs = (item.dtcs || []).slice(0, 4).map(d => `<span class="forum-chip">${esc(d)}</span>`).join('');
    return `<article class="forum-case-card status-${esc(item.status)}" data-open-case="${item.id}" tabindex="0" role="button" aria-label="Abrir ${esc(item.title)}">
      <div class="forum-card-top">
        <div>
          <span class="forum-ref">${esc(item.ref)} · ${esc(item.categoryName)}</span>
          <h3>${esc(item.title)}</h3>
        </div>
        ${statusBadge(item.status)}
      </div>
      <p class="forum-card-desc">${esc(item.body)}</p>
      ${dtcs ? `<div class="forum-chip-row">${dtcs}</div>` : ''}
      <div class="forum-meta-line">
        ${vehicle ? `<span><b>Vehículo:</b> ${esc(vehicle)}</span>` : ''}
        <span><b>Por</b> ${esc(item.author.displayName)}</span>
        <span>${esc(when(item.updatedAt))}</span>
      </div>
      <div class="forum-card-foot">
        <span class="forum-stat-ico">${icon('check')} ${num(item.votes)} útiles</span>
        <span class="forum-stat-ico">${icon('chat')} ${num(item.replies)} respuestas</span>
        <span class="forum-stat-ico">${icon('image')} ${num(item.attachments)} archivos</span>
        <span class="right"><span class="forum-stat-ico">${icon('search')} ${num(item.views)} lecturas</span></span>
      </div>
    </article>`;
  }

  function renderCases(append = false) {
    const box = el('forumList');
    if (!box) return;
    if (!append) box.innerHTML = state.cases.length ? state.cases.map(caseCard).join('') : emptyState('Todavía no hay casos', 'Publica la primera avería o ajusta los filtros. Los casos reales aparecerán aquí y la IA podrá usarlos como referencia.');
    else box.insertAdjacentHTML('beforeend', state.cases.map(caseCard).join(''));
    el('forumListCount').textContent = `${num(state.total)} ${state.total === 1 ? 'caso' : 'casos'}`;
    el('forumLoadMore')?.classList.toggle('hidden', state.cases.length >= state.total);
  }

  async function loadCases({ append = false } = {}) {
    if (state.busy) return;
    state.busy = true;
    const list = el('forumList');
    if (!append && list) list.innerHTML = loading();
    try {
      const params = new URLSearchParams({
        limit: String(state.limit),
        offset: String(append ? state.offset : 0),
        sort: state.filters.sort || 'relevancia'
      });
      if (state.filters.q) params.set('q', state.filters.q);
      if (state.filters.category) params.set('category', state.filters.category);
      if (state.filters.status) params.set('status', state.filters.status);
      if (state.filters.days) params.set('days', state.filters.days);
      const res = await api(`/api/forum/cases?${params}`);
      state.total = Number(res.total || 0);
      state.offset = append ? state.offset + (res.cases || []).length : (res.cases || []).length;
      state.cases = append ? state.cases.concat(res.cases || []) : (res.cases || []);
      renderCases(append);
      showPane('list');
    } catch (e) {
      globalStatus(e.message, 'error');
      if (list) list.innerHTML = emptyState('No se pudo cargar el foro', e.message);
    } finally {
      state.busy = false;
    }
  }

  function techBlock(title, value, full = false) {
    if (!value) return '';
    return `<div class="forum-tech-block ${full ? 'full' : ''}"><h4>${esc(title)}</h4><p>${esc(value)}</p></div>`;
  }

  function attachmentsHtml(list) {
    if (!list?.length) return '';
    return `<div class="forum-attachments">${list.map(a => a.mime.startsWith('image/')
      ? `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"><span class="file">${esc(a.name)}</span></a>`
      : `<a href="${esc(a.url)}" target="_blank" rel="noopener"><span class="file">${icon('file')}${esc(a.name)}<br><small>${Math.round(a.size / 1024)} KB</small></span></a>`).join('')}</div>`;
  }

  function renderReplies(replies) {
    const children = new Map();
    for (const r of replies) {
      const key = r.parentId || 0;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(r);
    }
    const renderOne = (r, depth = 0) => {
      const stars = r.rating ? `<span class="forum-rating" title="${r.ratingCount} valoraciones">${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5 - Math.round(r.rating))}</span>` : '';
      const rateButtons = state.user && state.user.username !== r.author.username
        ? `<span class="forum-inline-form">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-rate="${v}" data-reply="${r.id}" title="Valorar ${v}/5">${v}★</button>`).join('')}</span>`
        : '';
      const canEdit = state.user && (state.user.username === r.author.username || ['admin', 'moderator'].includes(state.user.role));
      const verify = state.user && ['admin', 'moderator'].includes(state.user.role) && !r.verified
        ? `<button type="button" data-verify="${r.id}">Verificar solución</button>` : '';
      const propose = canEdit && !r.verified && !r.proposal
        ? `<button type="button" data-propose="${r.id}">Proponer como solución</button>` : '';
      const report = state.user && state.user.username !== r.author.username
        ? `<button type="button" data-report-reply="${r.id}">Denunciar</button>` : '';
      const hide = canEdit ? (r.hidden
        ? `<button type="button" data-show-reply="${r.id}">Mostrar</button>`
        : `<button type="button" data-hide-reply="${r.id}">Ocultar</button>`) : '';
      const childHtml = (children.get(r.id) || []).map(c => renderOne(c, depth + 1)).join('');
      return `<article class="forum-reply ${r.verified ? 'is-solution' : ''} ${depth ? 'nested' : ''}" id="reply-${r.id}">
        <div class="forum-reply-head">
          ${avatar(r.author, 'sm')}
          <button class="forum-author-link" type="button" data-profile="${esc(r.author.username)}">${esc(r.author.displayName)}</button>
          <span>${esc(r.author.role)} · ${num(r.author.reputation)} rep.</span>
          <span>${esc(when(r.createdAt))}</span>
          ${r.proposal ? '<span class="forum-chip gold">Propuesta de solución</span>' : ''}
          ${r.verified ? '<span class="forum-chip gold">Verificada</span>' : ''}
          ${r.hidden ? '<span class="forum-chip">Oculta</span>' : ''}
        </div>
        <div class="forum-reply-body">${esc(r.body)}</div>
        ${attachmentsHtml(r.attachments)}
        ${r.verified && r.verificationNotes ? `<p class="forum-note"><strong>Pruebas:</strong> ${esc(r.verificationNotes)}</p>` : ''}
        <div class="forum-reply-actions">
          <button type="button" data-vote-reply="${r.id}" class="${r.userVote ? 'active' : ''}">${icon('check')} ${num(r.votes)} útil</button>
          ${stars} ${rateButtons}
          <button type="button" data-reply-to="${r.id}" data-reply-name="${esc(r.author.displayName)}">Responder</button>
          ${propose}${verify}${report}${hide}
        </div>
        ${childHtml}
      </article>`;
    };
    return (children.get(0) || []).map(r => renderOne(r)).join('');
  }

  function renderCase(c) {
    state.currentCase = c;
    const vehicle = [c.vehicle.brand, c.vehicle.model, c.vehicle.year, c.vehicle.engine, c.vehicle.engineCode, c.vehicle.mileage].filter(Boolean);
    const dtcs = (c.dtcs || []).map(d => `<span class="forum-chip">${esc(d)}</span>`).join('');
    const authorActions = c.canEdit ? `<button class="btn ghost sm" type="button" data-edit-case="${c.id}">${icon('wrench')} Editar</button>
      <button class="btn ghost sm" type="button" data-hide-case="${c.id}">Ocultar</button>` : '';
    const report = state.user && state.user.username !== c.author.username ? `<button class="btn ghost sm" type="button" data-report-case="${c.id}">${icon('flag')} Denunciar</button>` : '';
    const editableStatuses = ['abierto', 'investigacion', 'cerrado'];
    const statusOptions = (!editableStatuses.includes(c.status)
      ? `<option value="${esc(c.status)}" selected disabled>${esc(statusLabel(c.status))}</option>` : '') +
      editableStatuses.map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('');
    const statusControl = c.canEdit ? `<label class="forum-filter" style="max-width:240px">Estado del caso
      <select data-case-status="${c.id}">${statusOptions}</select></label>` : '';
    const verified = (c.repliesList || []).find(r => r.verified);
    const solution = verified ? `<div class="forum-solution"><h3>${icon('check')} Solución verificada</h3><p>${esc(verified.body)}</p>${verified.verificationNotes ? `<small><strong>Pruebas aportadas:</strong> ${esc(verified.verificationNotes)}</small>` : ''}<small>Verificada por un moderador. Las demás respuestas son propuestas.</small></div>` : '';
    const logged = Boolean(state.user);
    const replyForm = logged ? `<form class="forum-reply-form" id="forumReplyForm">
      <div id="forumReplyTarget" class="forum-login-note hidden"></div>
      <input class="hp-field" id="forumReplyWebsite" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <textarea id="forumReplyBody" maxlength="6000" placeholder="Aporta una hipótesis, medición o prueba. No presentes una suposición como solución verificada." required></textarea>
      <label><input type="checkbox" id="forumReplyProposal"> Esta respuesta es una propuesta de solución</label>
      <label class="forum-file-label">${icon('image')} Adjuntar fotos o PDF <input type="file" id="forumReplyFiles" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple></label>
      <div id="forumReplyFileInfo" class="forum-file-info"></div>
      <div class="actions"><button class="btn primary sm" type="submit">${icon('send')} Publicar respuesta</button><button type="button" class="btn ghost sm" data-cancel-reply>Cancelar respuesta a</button></div>
      <div id="forumReplyStatus" class="form-status" role="status" aria-live="polite"></div>
    </form>` : `<div class="forum-login-note">Inicia sesión para responder, votar o proponer una solución.</div>`;
    el('forumCaseView').innerHTML = `<div class="forum-case">
      <button class="forum-back" type="button" data-forum-back>${icon('arrow')} Volver al foro</button>
      <article class="forum-case-hero">
        <div class="forum-case-sub"><span class="forum-ref">${esc(c.ref)}</span>${statusBadge(c.status)}<span>${esc(categoryName(c.category))}</span><span>${esc(when(c.createdAt))}</span></div>
        <h2>${esc(c.title)}</h2>
        <div class="forum-case-sub">${avatar(c.author, 'sm')}<span><button class="forum-author-link" type="button" data-profile="${esc(c.author.username)}">${esc(c.author.displayName)}</button> · ${esc(c.author.role)} · ${num(c.author.reputation)} reputación</span><span>${num(c.views)} lecturas</span></div>
        ${vehicle.length ? `<div class="forum-meta-line" style="margin-top:8px">${vehicle.map(v => `<span>${esc(v)}</span>`).join(' · ')}</div>` : ''}
        ${dtcs ? `<div class="forum-chip-row">${dtcs}</div>` : ''}
        <div class="forum-detail-actions">
          <button class="forum-vote-btn ${c.userVote ? 'active' : ''}" type="button" data-vote-case="${c.id}">${icon('check')} ${num(c.votes)} útil</button>
          <button class="btn ghost sm" type="button" data-tut-case>${icon('play')} Buscar tutoriales</button>
          <button class="btn ghost sm" type="button" data-dm-user="${esc(c.author.username)}">${icon('mail')} Privado al autor</button>
          ${authorActions}${report}
        </div>
        ${statusControl}
      </article>
      ${solution}
      <div class="forum-technical">
        ${techBlock('Descripción', c.body, true)}
        ${techBlock('Síntomas', c.symptoms)}
        ${techBlock('Condiciones', c.conditions)}
        ${techBlock('Mediciones', c.measurements)}
        ${techBlock('Pruebas efectuadas', c.tests)}
        ${techBlock('Reparaciones intentadas', c.repairs)}
        ${techBlock('Resultado final', c.result, true)}
      </div>
      ${c.attachmentsList?.length ? `<section><div class="forum-section-title"><h3>Archivos del caso</h3></div>${attachmentsHtml(c.attachmentsList)}</section>` : ''}
      <section>
        <div class="forum-section-title"><h3>${num(c.repliesList.length)} respuestas</h3><span class="muted">${c.repliesList.length ? 'Las respuestas encadenadas conservan su contexto.' : 'Todavía no hay respuestas.'}</span></div>
        <div class="forum-replies">${c.repliesList.length ? renderReplies(c.repliesList) : emptyState('Sin respuestas todavía', 'Aporta la primera comprobación o hipótesis técnica.')}</div>
        ${replyForm}
      </section>
      <details class="forum-history"><summary>Historial de modificaciones (${c.history.length})</summary><div>${c.history.map(h => `<p>${esc(h.displayName)} · ${esc(h.action)} ${h.detail ? `— ${esc(h.detail)}` : ''} <time>${esc(when(h.createdAt))}</time></p>`).join('')}</div></details>
    </div>`;
    showPane('case');
    bindReplyForm();
  }

  async function openCase(id) {
    state.replyParent = null;
    state.replyToName = '';
    state.files = [];
    globalStatus('Cargando caso...');
    const box = el('forumCaseView');
    box.innerHTML = loading();
    showPane('case');
    try {
      const c = await api(`/api/forum/cases/${id}`);
      renderCase(c);
      globalStatus('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      box.innerHTML = emptyState('No se pudo abrir el caso', e.message);
      globalStatus(e.message, 'error');
    }
  }

  function readFiles(input) {
    const files = [...(input?.files || [])].slice(0, 4);
    return Promise.all(files.map(file => new Promise((resolve, reject) => {
      if (file.size > 2 * 1024 * 1024) return reject(new Error(`"${file.name}" supera 2 MB.`));
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, data: reader.result });
      reader.onerror = () => reject(new Error(`No se pudo leer "${file.name}".`));
      reader.readAsDataURL(file);
    })));
  }

  function openEditor(c) {
    state.files = [];
    el('forumEditorHeading').textContent = c ? 'Editar caso' : 'Publicar una avería';
    el('forumCaseId').value = c ? c.id : '';
    el('forumCaseTitle').value = c?.title || '';
    el('forumCaseCategory').value = c?.category || state.categories[0]?.id || 'motor';
    el('forumCaseBrand').value = c?.vehicle?.brand || '';
    el('forumCaseModel').value = c?.vehicle?.model || '';
    el('forumCaseYear').value = c?.vehicle?.year || '';
    el('forumCaseEngine').value = c?.vehicle?.engine || '';
    el('forumCaseEngineCode').value = c?.vehicle?.engineCode || '';
    el('forumCaseMileage').value = c?.vehicle?.mileage || '';
    el('forumCaseDtcs').value = (c?.dtcs || []).join(' ');
    el('forumCaseBody').value = c?.body || '';
    el('forumCaseSymptoms').value = c?.symptoms || '';
    el('forumCaseConditions').value = c?.conditions || '';
    el('forumCaseMeasurements').value = c?.measurements || '';
    el('forumCaseTests').value = c?.tests || '';
    el('forumCaseRepairs').value = c?.repairs || '';
    el('forumCaseResult').value = c?.result || '';
    el('forumCaseFiles').value = '';
    el('forumFileInfo').innerHTML = '';
    editorStatus(c ? 'Los archivos nuevos no se adjuntan al editar; el resto de cambios sí se guardan.' : '');
    showPane('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindReplyForm() {
    const fileInput = el('forumReplyFiles');
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        try {
          state.files = await readFiles(fileInput);
          el('forumReplyFileInfo').innerHTML = state.files.map(f => `<span>${esc(f.name)}</span>`).join('');
        } catch (e) {
          el('forumReplyStatus').textContent = e.message;
          el('forumReplyStatus').className = 'form-status error';
        }
      });
    }
    const replyTarget = el('forumReplyTarget');
    if (state.replyParent && replyTarget) {
      replyTarget.classList.remove('hidden');
      replyTarget.textContent = `Respondiendo a ${state.replyToName} (respuesta encadenada).`;
    }
  }

  async function submitReply(form) {
    const body = el('forumReplyBody').value.trim();
    const box = el('forumReplyStatus');
    if (body.length < 2) {
      box.textContent = 'Escribe una respuesta antes de publicar.';
      box.className = 'form-status error';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const files = await readFiles(el('forumReplyFiles'));
      const c = await jsonPost(`/api/forum/cases/${state.currentCase.id}/replies`, {
        body,
        parentId: state.replyParent || null,
        proposal: el('forumReplyProposal').checked,
        website: el('forumReplyWebsite')?.value || '',
        attachments: files
      });
      state.replyParent = null;
      state.replyToName = '';
      renderCase(c);
      globalStatus('Respuesta publicada.', 'ok');
    } catch (e) {
      if (/sesión/i.test(e.message)) requireLogin(e.message);
      else {
        box.textContent = e.message;
        box.className = 'form-status error';
      }
    } finally {
      button.disabled = false;
    }
  }

  async function openMessages(username = '') {
    if (!state.user) return requireLogin('Inicia sesión para usar los mensajes privados.');
    if (username) state.activeThread = null;
    showPane('messages');
    const box = el('forumMessagesView');
    box.innerHTML = loading();
    try {
      const res = await api('/api/forum/messages');
      state.threads = res.threads || [];
      box.innerHTML = `<div class="forum-editor-head"><div><span class="eyebrow"><i></i> PRIVADOS</span><h2>Mensajes privados</h2></div><button class="btn ghost sm" type="button" data-refresh-threads>${icon('refresh')} Actualizar</button></div>
        <div class="forum-msg-layout">
          <div><div class="forum-thread-list">${state.threads.length ? state.threads.map(t => `<button type="button" data-thread="${t.id}" class="${state.activeThread === t.id ? 'active' : ''}"><span>${esc(t.with.displayName)}</span>${t.unread ? `<span class="unread"> · ${t.unread} nuevo(s)</span>` : ''}<small>${esc(t.lastMessage || '')}</small></button>`).join('') : '<p class="muted">Aún no hay conversaciones.</p>'}</div>
          <div class="forum-dm-compose"><input id="forumDmTo" placeholder="Usuario destinatario" value="${esc(username)}" maxlength="24"><textarea id="forumDmBody" placeholder="Mensaje privado..." maxlength="4000"></textarea><button class="btn primary sm" type="button" data-send-dm>${icon('send')} Enviar privado</button><div id="forumDmStatus" class="form-status" role="status" aria-live="polite"></div></div></div>
          <div class="forum-message-pane" id="forumMessagePane">${state.threads.length ? '<p class="muted">Selecciona una conversación.</p>' : emptyState('Sin mensajes privados', 'Las conversaciones privadas solo son visibles para sus participantes.')}</div>
        </div>`;
      if (state.activeThread) await loadThread(state.activeThread);
      else if (!username && state.threads.length) await loadThread(state.threads[0].id);
    } catch (e) {
      box.innerHTML = emptyState('No se pudieron cargar los privados', e.message);
    }
  }

  async function loadThread(id) {
    if (!state.user) return;
    state.activeThread = Number(id);
    const pane = el('forumMessagePane');
    if (pane) pane.innerHTML = loading();
    $$f('[data-thread]').forEach(b => b.classList.toggle('active', Number(b.dataset.thread) === Number(id)));
    try {
      const t = await api(`/api/forum/messages/${id}`);
      const pane2 = el('forumMessagePane');
      pane2.innerHTML = `<div class="forum-section-title"><h3>${esc(t.with.displayName)}</h3><span class="muted">${esc(t.with.role)} · ${num(t.with.reputation)} reputación</span></div>
        <div class="forum-replies">${t.messages.map(m => `<div class="forum-dm ${m.mine ? 'mine' : ''}"><small>${esc(m.sender.displayName)} · ${esc(when(m.createdAt))}</small><p>${esc(m.body)}</p></div>`).join('') || '<p class="muted">Conversación vacía.</p>'}</div>
        <div class="forum-dm-compose"><textarea id="forumThreadBody" placeholder="Escribe una respuesta privada..." maxlength="4000"></textarea><button class="btn primary sm" type="button" data-send-thread="${t.id}">${icon('send')} Enviar</button><div id="forumDmStatus" class="form-status" role="status" aria-live="polite"></div></div>`;
      state.activeThread = Number(id);
      await loadMessagesList(false);
    } catch (e) {
      if (pane) pane.innerHTML = emptyState('Conversación no disponible', e.message);
    }
  }

  async function loadMessagesList(render = true) {
    if (!state.user || !render) return;
    try {
      const res = await api('/api/forum/messages');
      state.threads = res.threads || [];
    } catch { /* no bloquea la conversación abierta */ }
  }

  async function sendDm({ threadId, to, body }) {
    const status = el('forumDmStatus');
    try {
      if (!String(body || '').trim()) throw new Error('Escribe un mensaje.');
      const res = await jsonPost('/api/forum/messages', { threadId, to, body });
      state.activeThread = res.threadId;
      await openMessages();
    } catch (e) {
      if (status) {
        status.textContent = e.message;
        status.className = 'form-status error';
      }
    }
  }

  async function openProfile(username) {
    showPane('profile');
    const box = el('forumProfileView');
    box.innerHTML = loading();
    try {
      const p = await api(`/api/forum/users/${encodeURIComponent(username)}`);
      state.activeProfile = p;
      const selfForm = p.isSelf ? `<form class="forum-form" id="forumProfileForm" style="margin-top:16px"><div class="forum-form-grid">
        <label>Nombre visible<input id="forumProfileName" maxlength="60" value="${esc(p.user.displayName)}"></label>
        <label>Especialidad<input id="forumProfileSpecialty" maxlength="120" value="${esc(p.user.specialty)}"></label>
        <label>Ubicación<input id="forumProfileLocation" maxlength="120" value="${esc(p.user.location)}"></label>
        <label class="full">Biografía<textarea id="forumProfileBio" rows="3" maxlength="500">${esc(p.user.bio)}</textarea></label>
      </div><div class="actions"><button class="btn primary sm" type="submit">Guardar perfil</button></div><div id="forumProfileStatus" class="form-status" role="status" aria-live="polite"></div></form>` : '';
      box.innerHTML = `<button class="forum-back" type="button" data-forum-back>${icon('arrow')} Volver al foro</button>
        <div class="forum-profile-head">${avatar(p.user)}<div><h2>${esc(p.user.displayName)}</h2><span class="muted">@${esc(p.user.username)} · ${esc(p.user.role)}</span><div class="forum-meta-line">${p.user.specialty ? `<span>${esc(p.user.specialty)}</span>` : ''}${p.user.location ? `<span>${esc(p.user.location)}</span>` : ''}<span>Desde ${esc(when(p.user.createdAt))}</span></div></div></div>
        ${p.user.bio ? `<p>${esc(p.user.bio)}</p>` : '<p class="muted">Sin biografía todavía.</p>'}
        <div class="forum-profile-stats"><div><b>${num(p.stats.cases)}</b><span>Casos</span></div><div><b>${num(p.stats.replies)}</b><span>Respuestas</span></div><div><b>${num(p.stats.solutions)}</b><span>Verificadas</span></div><div><b>${num(p.stats.helpful)}</b><span>Útiles</span></div></div>
        <div class="forum-detail-actions"><button class="btn ghost sm" type="button" data-dm-user="${esc(p.user.username)}">${icon('mail')} Enviar privado</button></div>
        <div class="forum-section-title"><h3>Casos recientes</h3></div>
        <div class="forum-profile-list">${p.recentCases.length ? p.recentCases.map(c => `<button type="button" data-open-case="${c.id}">${esc(c.ref)} · ${esc(c.title)} <span class="forum-ref">${esc(statusLabel(c.status))}</span></button>`).join('') : '<p class="muted">Sin casos publicados.</p>'}</div>
        ${selfForm}`;
    } catch (e) {
      box.innerHTML = emptyState('Perfil no disponible', e.message);
    }
  }

  async function openModeration() {
    if (!state.user || !['admin', 'moderator'].includes(state.user.role)) return globalStatus('No tienes permisos de moderación.', 'error');
    showPane('moderation');
    const box = el('forumModerationView');
    box.innerHTML = loading();
    try {
      const res = await api('/api/forum/moderation/reports?status=pendiente');
      state.moderation = res.reports || [];
      box.innerHTML = `<div class="forum-editor-head"><div><span class="eyebrow"><i></i> MODERACIÓN</span><h2>Denuncias pendientes</h2></div><button class="btn ghost sm" type="button" data-refresh-moderation>${icon('refresh')} Actualizar</button></div>
        ${state.moderation.length ? state.moderation.map(r => `<div class="forum-mod-card"><strong>${esc(r.targetType)} #${r.targetId} · ${esc(r.reason)}</strong><p>${esc(r.preview)}</p><p>Denunciado por @${esc(r.reporter)} · ${esc(when(r.createdAt))}${r.detail ? ` · ${esc(r.detail)}` : ''}</p><div class="actions"><button class="btn ghost sm" type="button" data-mod-hide="${esc(r.targetType)}:${r.targetId}:${r.hidden ? 'show' : 'hide'}">${r.hidden ? 'Restaurar contenido' : 'Ocultar contenido'}</button><button class="btn ghost sm" type="button" data-mod-resolve="${r.id}:resuelta">Resolver</button><button class="btn ghost sm" type="button" data-mod-resolve="${r.id}:descartada">Descartar</button></div></div>`).join('') : emptyState('Sin denuncias pendientes', 'La bandeja de moderación está limpia.')}
        <div class="forum-divider"></div><h3>Suspender usuario</h3><form class="forum-inline-form" id="forumBanForm"><input id="forumBanUser" placeholder="Usuario" maxlength="24" required><select id="forumBanDays"><option value="1">1 día</option><option value="7" selected>7 días</option><option value="30">30 días</option><option value="0">Quitar suspensión</option></select><input id="forumBanReason" placeholder="Motivo" maxlength="300"><button class="btn ghost sm" type="submit">Aplicar</button></form><div id="forumModStatus" class="form-status" role="status" aria-live="polite"></div>`;
    } catch (e) {
      box.innerHTML = emptyState('No se pudo abrir moderación', e.message);
    }
  }

  async function markProposal(replyId) {
    try {
      const c = await jsonPost(`/api/forum/replies/${replyId}/proposal`, {}, 'PATCH');
      renderCase(c);
      globalStatus('Respuesta marcada como propuesta de solución.', 'ok');
    } catch (e) { globalStatus(e.message, 'error'); }
  }

  async function verifyReply(replyId) {
    const notes = window.prompt('¿Qué pruebas respaldan esta solución? (mediciones, prueba en carretera, comprobación física)', '') || '';
    try {
      const c = await jsonPost(`/api/forum/cases/${state.currentCase.id}/solution`, { replyId, notes });
      renderCase(c);
      globalStatus('Solución verificada y guardada en la base de conocimiento.', 'ok');
    } catch (e) { globalStatus(e.message, 'error'); }
  }

  async function report(type, id) {
    const reason = window.prompt('Motivo de la denuncia (spam, información peligrosa, suplantación, otro):', '');
    if (!reason) return;
    try {
      await jsonPost('/api/forum/reports', { targetType: type, targetId: id, reason });
      globalStatus('Denuncia enviada a moderación. Gracias.', 'ok');
    } catch (e) { globalStatus(e.message, 'error'); }
  }

  async function hideContent(type, id, hidden = true) {
    const reason = hidden ? 'Ocultado por moderación.' : 'Restaurado por moderación.';
    try {
      if (type === 'case') {
        if (hidden) await jsonPost(`/api/forum/cases/${id}`, { reason }, 'DELETE');
        else await jsonPost('/api/forum/moderation/content', { type: 'case', id, hidden: false, note: reason }, 'PATCH');
        globalStatus(hidden ? 'Caso ocultado.' : 'Caso restaurado.', 'ok');
        await loadCases();
      } else {
        await jsonPost(`/api/forum/replies/${id}/visibility`, { hidden, reason }, 'PATCH');
        if (state.currentCase) {
          const fresh = await api(`/api/forum/cases/${state.currentCase.id}`);
          renderCase(fresh);
        }
        globalStatus(hidden ? 'Respuesta ocultada.' : 'Respuesta restaurada.', 'ok');
      }
    } catch (e) { globalStatus(e.message, 'error'); }
  }

  async function updateCaseStatus(id, status) {
    try {
      const c = await jsonPost(`/api/forum/cases/${id}`, { status }, 'PATCH');
      renderCase(c);
      globalStatus('Estado actualizado.', 'ok');
    } catch (e) { globalStatus(e.message, 'error'); }
  }

  async function handleCaseSubmit(e) {
    e.preventDefault();
    const button = el('forumSaveCase');
    button.disabled = true;
    editorStatus('Guardando...');
    try {
      const id = el('forumCaseId').value;
      const payload = {
        title: el('forumCaseTitle').value,
        category: el('forumCaseCategory').value,
        vehicleBrand: el('forumCaseBrand').value,
        vehicleModel: el('forumCaseModel').value,
        vehicleYear: el('forumCaseYear').value,
        engine: el('forumCaseEngine').value,
        engineCode: el('forumCaseEngineCode').value,
        mileage: el('forumCaseMileage').value,
        dtcs: parseDtcs(el('forumCaseDtcs').value),
        body: el('forumCaseBody').value,
        symptoms: el('forumCaseSymptoms').value,
        conditions: el('forumCaseConditions').value,
        measurements: el('forumCaseMeasurements').value,
        tests: el('forumCaseTests').value,
        repairs: el('forumCaseRepairs').value,
        result: el('forumCaseResult').value,
        website: el('forumCaseWebsite').value
      };
      let res;
      if (id) {
        res = await jsonPost(`/api/forum/cases/${id}`, payload, 'PATCH');
      } else {
        const files = await readFiles(el('forumCaseFiles'));
        res = await jsonPost('/api/forum/cases', { ...payload, attachments: files });
      }
      await loadCategories();
      await loadStats();
      await openCase(res.id);
      globalStatus(id ? 'Caso actualizado.' : 'Caso publicado. Ya está disponible para la comunidad y la IA.', 'ok');
    } catch (e) {
      if (/sesión/i.test(e.message)) requireLogin(e.message);
      editorStatus(e.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  function filtersFromControls() {
    state.filters.q = el('forumSearch').value.trim();
    state.filters.category = el('forumCategoryFilter').value;
    state.filters.status = el('forumStatusFilter').value;
    state.filters.days = el('forumDateFilter').value;
    state.filters.sort = el('forumSortFilter').value;
  }

  function bindStaticEvents() {
    el('forumTabLogin')?.addEventListener('click', () => {
      el('forumTabLogin').classList.add('active');
      el('forumTabLogin').setAttribute('aria-selected', 'true');
      el('forumTabRegister').classList.remove('active');
      el('forumTabRegister').setAttribute('aria-selected', 'false');
      el('forumLoginForm').classList.remove('hidden');
      el('forumRegisterForm').classList.add('hidden');
    });
    el('forumTabRegister')?.addEventListener('click', () => {
      el('forumTabRegister').classList.add('active');
      el('forumTabRegister').setAttribute('aria-selected', 'true');
      el('forumTabLogin').classList.remove('active');
      el('forumTabLogin').setAttribute('aria-selected', 'false');
      el('forumRegisterForm').classList.remove('hidden');
      el('forumLoginForm').classList.add('hidden');
    });
    el('forumLoginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      authStatus('Entrando...');
      try {
        const res = await jsonPost('/api/forum/auth/login', {
          username: el('forumLoginUser').value,
          password: el('forumLoginPass').value,
          website: e.target.website?.value || ''
        });
        state.user = res.user;
        renderAuth();
        authStatus('Sesión iniciada.', 'ok');
        el('forumLoginPass').value = '';
        await loadCases();
      } catch (err) { authStatus(err.message, 'error'); }
    });
    el('forumRegisterForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      authStatus('Creando cuenta...');
      try {
        const res = await jsonPost('/api/forum/auth/register', {
          username: el('forumRegisterUser').value,
          displayName: el('forumRegisterName').value,
          password: el('forumRegisterPass').value,
          website: e.target.website?.value || ''
        });
        state.user = res.user;
        renderAuth();
        authStatus('Cuenta creada. Ya puedes publicar y responder.', 'ok');
        el('forumRegisterPass').value = '';
        await loadCases();
      } catch (err) { authStatus(err.message, 'error'); }
    });
    el('forumLogout')?.addEventListener('click', async () => {
      try { await jsonPost('/api/forum/auth/logout', {}); } catch { /* la sesión local se cierra igual */ }
      state.user = null;
      renderAuth();
      authStatus('Sesión cerrada.');
      await loadCases();
    });
    el('forumNewBtn')?.addEventListener('click', () => {
      if (!state.user) return requireLogin('Inicia sesión para publicar una avería.');
      openEditor(null);
    });
    el('forumSearchBtn')?.addEventListener('click', () => { filtersFromControls(); renderCategoryList(); loadCases(); });
    el('forumSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') { filtersFromControls(); loadCases(); } });
    el('forumSearch')?.addEventListener('input', debounce(() => { filtersFromControls(); loadCases(); }, 450));
    el('forumCategoryFilter')?.addEventListener('change', () => { filtersFromControls(); renderCategoryList(); loadCases(); });
    el('forumStatusFilter')?.addEventListener('change', () => { filtersFromControls(); loadCases(); });
    el('forumDateFilter')?.addEventListener('change', () => { filtersFromControls(); loadCases(); });
    el('forumSortFilter')?.addEventListener('change', () => { filtersFromControls(); loadCases(); });
    el('forumResetBtn')?.addEventListener('click', () => {
      el('forumSearch').value = '';
      el('forumCategoryFilter').value = '';
      el('forumStatusFilter').value = '';
      el('forumDateFilter').value = '';
      el('forumSortFilter').value = 'relevancia';
      filtersFromControls();
      renderCategoryList();
      loadCases();
    });
    el('forumRefreshBtn')?.addEventListener('click', () => { loadStats(); loadCases(); });
    el('forumLoadMore')?.addEventListener('click', () => loadCases({ append: true }));
    el('forumProfileBtn')?.addEventListener('click', () => state.user ? openProfile(state.user.username) : requireLogin());
    el('forumMessagesBtn')?.addEventListener('click', () => openMessages());
    el('forumModerationBtn')?.addEventListener('click', openModeration);
    el('forumCancelCase')?.addEventListener('click', () => state.currentCase ? renderCase(state.currentCase) : showPane('list'));
    el('forumCancelCase2')?.addEventListener('click', () => state.currentCase ? renderCase(state.currentCase) : showPane('list'));
    el('forumCaseForm')?.addEventListener('submit', handleCaseSubmit);
    el('forumCaseFiles')?.addEventListener('change', async () => {
      try {
        state.files = await readFiles(el('forumCaseFiles'));
        el('forumFileInfo').innerHTML = state.files.map(f => `<span>${esc(f.name)}</span>`).join('');
      } catch (e) { editorStatus(e.message, 'error'); }
    });
    el('forumCatList')?.addEventListener('click', e => {
      const b = e.target.closest('[data-category]');
      if (!b) return;
      state.filters.category = b.dataset.category;
      el('forumCategoryFilter').value = b.dataset.category;
      renderCategoryList();
      loadCases();
    });
    el('forumList')?.addEventListener('click', e => {
      const card = e.target.closest('[data-open-case]');
      if (card) openCase(card.dataset.openCase);
    });
    el('forumList')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-open-case]');
      if (card) { e.preventDefault(); openCase(card.dataset.openCase); }
    });
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('submit', handleGlobalSubmit);
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  async function handleGlobalClick(e) {
    const target = e.target.closest('[data-forum-back], [data-open-case], [data-vote-case], [data-vote-reply], [data-reply-to], [data-verify], [data-propose], [data-rate], [data-report-case], [data-report-reply], [data-dm-user], [data-edit-case], [data-hide-case], [data-hide-reply], [data-show-reply], [data-thread], [data-send-dm], [data-send-thread], [data-refresh-threads], [data-refresh-moderation], [data-mod-hide], [data-mod-resolve], [data-cancel-reply], [data-forum-ref], [data-profile], [data-tut-case]');
    if (!target) return;
    const t = target;

    if (t.dataset.forumBack !== undefined) {
      state.replyParent = null;
      showPane('list');
      return;
    }
    if (t.dataset.forumRef) {
      state.skipNextListLoad = true;
      showView('foro');
      bootForum().finally(() => openCase(Number(t.dataset.forumRef)));
      return;
    }
    if (t.dataset.profile) { openProfile(t.dataset.profile); return; }
    if (t.dataset.openCase) { openCase(t.dataset.openCase); return; }
    if (t.dataset.voteCase) {
      if (!state.user) return requireLogin('Inicia sesión para votar.');
      try {
        await jsonPost('/api/forum/vote', { targetType: 'case', targetId: Number(t.dataset.voteCase), value: 1 });
        const fresh = await api(`/api/forum/cases/${t.dataset.voteCase}`);
        renderCase(fresh);
      } catch (err) { globalStatus(err.message, 'error'); }
      return;
    }
    if (t.dataset.voteReply) {
      if (!state.user) return requireLogin('Inicia sesión para votar.');
      try {
        await jsonPost('/api/forum/vote', { targetType: 'reply', targetId: Number(t.dataset.voteReply), value: 1 });
        const fresh = await api(`/api/forum/cases/${state.currentCase.id}`);
        renderCase(fresh);
      } catch (err) { globalStatus(err.message, 'error'); }
      return;
    }
    if (t.dataset.replyTo) {
      if (!state.user) return requireLogin('Inicia sesión para responder.');
      state.replyParent = Number(t.dataset.replyTo);
      state.replyToName = t.dataset.replyName || '';
      bindReplyForm();
      el('forumReplyBody')?.focus();
      el('forumReplyTarget')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (t.dataset.verify) { verifyReply(Number(t.dataset.verify)); return; }
    if (t.dataset.propose) { markProposal(Number(t.dataset.propose)); return; }
    if (t.dataset.rate) {
      if (!state.user) return requireLogin('Inicia sesión para valorar.');
      try {
        await jsonPost(`/api/forum/replies/${t.dataset.reply}/rating`, { value: Number(t.dataset.rate) });
        const fresh = await api(`/api/forum/cases/${state.currentCase.id}`);
        renderCase(fresh);
      } catch (err) { globalStatus(err.message, 'error'); }
      return;
    }
    if (t.dataset.reportCase) { report('case', Number(t.dataset.reportCase)); return; }
    if (t.dataset.reportReply) { report('reply', Number(t.dataset.reportReply)); return; }
    if (t.dataset.dmUser) {
      if (!state.user) return requireLogin('Inicia sesión para enviar privados.');
      await openMessages(t.dataset.dmUser);
      el('forumDmBody')?.focus();
      return;
    }
    if (t.dataset.tutCase !== undefined) {
      const c = state.currentCase;
      if (!c || typeof window.openTutorialSearch !== 'function') return;
      const q = (c.dtcs || [])[0] || String(c.title || '').split(/\s+/).slice(0, 4).join(' ');
      window.openTutorialSearch({
        q,
        dtc: (c.dtcs || [])[0] || ''
      });
      return;
    }
    if (t.dataset.editCase) { if (state.currentCase) openEditor(state.currentCase); return; }
    if (t.dataset.hideCase) { hideContent('case', Number(t.dataset.hideCase), true); return; }
    if (t.dataset.hideReply) { hideContent('reply', Number(t.dataset.hideReply), true); return; }
    if (t.dataset.showReply) { hideContent('reply', Number(t.dataset.showReply), false); return; }
    if (t.dataset.thread) { loadThread(t.dataset.thread); return; }
    if (t.dataset.refreshThreads !== undefined) { openMessages(); return; }
    if (t.dataset.refreshModeration !== undefined) { openModeration(); return; }
    if (t.dataset.sendDm !== undefined) {
      await sendDm({ to: el('forumDmTo').value, body: el('forumDmBody').value });
      return;
    }
    if (t.dataset.sendThread) {
      await sendDm({ threadId: Number(t.dataset.sendThread), body: el('forumThreadBody').value });
      return;
    }
    if (t.dataset.modHide) {
      const [type, id, action] = t.dataset.modHide.split(':');
      await hideContent(type, Number(id), action !== 'show');
      await openModeration();
      return;
    }
    if (t.dataset.modResolve) {
      const [id, action] = t.dataset.modResolve.split(':');
      try {
        await jsonPost(`/api/forum/moderation/reports/${id}`, { action }, 'PATCH');
        await openModeration();
      } catch (err) { globalStatus(err.message, 'error'); }
      return;
    }
    if (t.dataset.cancelReply !== undefined) {
      state.replyParent = null;
      state.replyToName = '';
      el('forumReplyTarget')?.classList.add('hidden');
      return;
    }
  }

  async function handleGlobalSubmit(e) {
    if (e.target.id === 'forumReplyForm') {
      e.preventDefault();
      await submitReply(e.target);
      return;
    }
    if (e.target.id === 'forumDmForm') {
      e.preventDefault();
      await sendDm({ to: el('forumDmTo').value, body: el('forumDmBody').value });
      return;
    }
    if (e.target.id === 'forumProfileForm') {
      e.preventDefault();
      const status = el('forumProfileStatus');
      try {
        const res = await jsonPost('/api/forum/me', {
          displayName: el('forumProfileName').value,
          specialty: el('forumProfileSpecialty').value,
          location: el('forumProfileLocation').value,
          bio: el('forumProfileBio').value
        }, 'PATCH');
        state.user = res.user;
        renderAuth();
        await openProfile(res.user.username);
      } catch (err) {
        if (status) { status.textContent = err.message; status.className = 'form-status error'; }
      }
      return;
    }
    if (e.target.id === 'forumBanForm') {
      e.preventDefault();
      const status = el('forumModStatus');
      try {
        const profile = await api(`/api/forum/users/${encodeURIComponent(el('forumBanUser').value.trim())}`);
        await jsonPost(`/api/forum/moderation/users/${profile.user.id}/ban`, {
          days: Number(el('forumBanDays').value),
          reason: el('forumBanReason').value
        });
        if (status) { status.textContent = 'Sanción aplicada.'; status.className = 'form-status ok'; }
      } catch (err) {
        if (status) { status.textContent = err.message; status.className = 'form-status error'; }
      }
    }
  }

  document.addEventListener('change', e => {
    if (e.target.matches('[data-case-status]')) updateCaseStatus(e.target.dataset.caseStatus, e.target.value);
  });

  document.addEventListener('viewchange', e => {
    if (e.detail?.name !== 'foro') return;
    if (state.skipNextListLoad) { state.skipNextListLoad = false; return; }
    if (!state.loaded) bootForum();
    else loadCases();
  });

  let bootPromise = null;
  async function bootForum() {
    if (state.loaded) return;
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      await Promise.all([loadCategories(), loadStats(), loadAuth()]);
      await loadCases();
      state.loaded = true;
    })().catch(e => globalStatus(e.message, 'error')).finally(() => { bootPromise = null; });
    return bootPromise;
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindStaticEvents();
    loadAuth();
    if (location.hash.slice(1) === 'foro') bootForum();
  });

  window.forumOpenCase = id => bootForum().finally(() => openCase(id));
  window.forumOpenProfile = username => bootForum().finally(() => openProfile(username));
})();
