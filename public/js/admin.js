(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const state = { loaded: false, admin: false };
  let loadSeq = 0;
  const STATUS_LABEL = {
    pending: 'En cola',
    running: 'Ejecutando',
    done: 'Hecha',
    error: 'Error'
  };

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function gateStatus(message = '', type = '') {
    const box = $('#adminGateStatus');
    if (!box) return;
    box.className = `form-status ${type}`.trim();
    box.textContent = message;
  }

  function orderStatus(message = '', type = '') {
    const box = $('#adminOrderStatus');
    if (!box) return;
    box.className = `form-status ${type}`.trim();
    box.textContent = message;
  }

  function setGateMode(mode) {
    const login = $('#adminLoginForm');
    const setup = $('#adminSetupForm');
    const noAccess = $('#adminNoAccess');
    login?.classList.toggle('hidden', mode !== 'login');
    setup?.classList.toggle('hidden', mode !== 'setup');
    noAccess?.classList.toggle('hidden', mode !== 'no-access');
  }

  function fmtDate(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderTasks(tasks = []) {
    const list = $('#adminTaskList');
    const count = $('#adminTaskCount');
    if (count) count.textContent = String(tasks.length);
    if (!list) return;
    if (!tasks.length) {
      list.innerHTML = '<p class="admin-empty">Todavía no hay órdenes. Escribe la primera arriba.</p>';
      return;
    }
    list.innerHTML = tasks.map(task => {
      const status = Object.prototype.hasOwnProperty.call(STATUS_LABEL, task.status) ? task.status : 'pending';
      const detail = [
        task.status === 'running' ? (task.progress || 'Trabajando…') : '',
        task.summary,
        task.commit ? `commit ${task.commit}` : '',
        task.pushed ? 'subido' : ''
      ].filter(Boolean).join(' · ');
      return `<article class="admin-task">
        <span class="admin-task-status ${status}">${STATUS_LABEL[status]}</span>
        <div class="admin-task-body">
          <p>${esc(task.instruction)}</p>
          ${detail ? `<small>${esc(detail)}</small>` : ''}
        </div>
        <time class="admin-task-time">${esc(fmtDate(task.createdAt))}</time>
      </article>`;
    }).join('');
  }

  function renderStats(stats = {}) {
    const box = $('#adminStats');
    if (!box) return;
    const items = [
      ['pending', 'En cola', stats.pending || 0],
      ['running', 'Ejecutando', stats.running || 0],
      ['done', 'Hechas', stats.done || 0],
      ['error', 'Con error', stats.error || 0]
    ];
    box.innerHTML = items.map(([key, label, value]) => `
      <div class="admin-stat ${key}"><b>${Number(value) || 0}</b><span>${label}</span></div>
    `).join('');
  }

  function render(data) {
    state.admin = Boolean(data.admin);
    const gate = $('#adminGate');
    const panel = $('#adminPanel');
    const title = $('#adminGateTitle');
    const text = $('#adminGateText');
    const worker = $('#adminWorker');

    if (data.admin) {
      gate?.classList.add('hidden');
      panel?.classList.remove('hidden');
      if ($('#adminWhoName')) $('#adminWhoName').textContent = data.user?.displayName || data.user?.username || 'Administrador';
      if ($('#adminWhoRole')) $('#adminWhoRole').textContent = data.user?.role || 'admin';
      if (worker) {
        worker.textContent = data.workerConfigured ? 'Worker conectado' : 'Worker sin configurar';
        worker.style.color = data.workerConfigured ? 'var(--ok)' : 'var(--muted)';
      }
      renderStats(data.stats || {});
      renderTasks(data.tasks || []);
      return;
    }

    panel?.classList.add('hidden');
    gate?.classList.remove('hidden');

    if (data.user) {
      if (title) title.textContent = 'Esta cuenta no es administradora';
      if (text) text.textContent = 'Has iniciado sesión, pero este apartado está reservado a la cuenta administradora.';
      setGateMode('no-access');
      gateStatus('');
      return;
    }

    if (data.setupOpen) {
      if (title) title.textContent = 'Crear la cuenta administradora';
      if (text) text.textContent = 'Esta instalación todavía no tiene ninguna cuenta. La primera será la administradora y también servirá para el foro.';
      setGateMode('setup');
      gateStatus('');
      return;
    }

    if (!data.admins) {
      if (title) title.textContent = 'No hay administrador configurado';
      if (text) text.textContent = 'La instalación tiene cuentas, pero ninguna es administradora. Hay que corregirlo desde el servidor.';
      setGateMode('none');
      gateStatus('No se puede entrar al taller hasta que exista una cuenta con rol admin.', 'error');
      return;
    }

    if (title) title.textContent = 'Entrar como administrador';
    if (text) text.textContent = 'Solo la cuenta administradora puede ver el taller y enviar órdenes a Maya.';
    setGateMode('login');
    gateStatus('');
  }

  async function load() {
    const seq = ++loadSeq;
    try {
      const data = await window.api('/api/admin/status');
      if (seq !== loadSeq) return;
      state.loaded = true;
      render(data);
    } catch (error) {
      if (seq !== loadSeq) return;
      gateStatus(error.message || 'No se pudo consultar el acceso de administrador.', 'error');
    }
  }

  async function post(url, body) {
    return window.api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  function onLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    gateStatus('Entrando...');
    if (button) button.disabled = true;
    post('/api/admin/login', {
      username: $('#adminLoginUser')?.value || '',
      password: $('#adminLoginPass')?.value || '',
      website: form.website?.value || ''
    }).then(() => {
      const pass = $('#adminLoginPass');
      if (pass) pass.value = '';
      gateStatus('Sesión iniciada.', 'ok');
      return load();
    }).catch(error => {
      gateStatus(error.message || 'No se pudo iniciar sesión.', 'error');
    }).finally(() => {
      if (button) button.disabled = false;
    });
  }

  function onSetup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = $('#adminSetupPass')?.value || '';
    const confirm = $('#adminSetupConfirm')?.value || '';
    if (password !== confirm) {
      gateStatus('Las dos contraseñas no coinciden.', 'error');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    gateStatus('Creando la cuenta administradora...');
    if (button) button.disabled = true;
    post('/api/admin/setup', {
      username: $('#adminSetupUser')?.value || '',
      displayName: $('#adminSetupName')?.value || '',
      password,
      confirm,
      website: form.website?.value || ''
    }).then(() => {
      const pass = $('#adminSetupPass');
      const repeat = $('#adminSetupConfirm');
      if (pass) pass.value = '';
      if (repeat) repeat.value = '';
      gateStatus('Cuenta administradora creada.', 'ok');
      return load();
    }).catch(error => {
      gateStatus(error.message || 'No se pudo crear la cuenta.', 'error');
    }).finally(() => {
      if (button) button.disabled = false;
    });
  }

  function onLogout() {
    gateStatus('Saliendo...');
    post('/api/admin/logout', {}).then(() => {
      orderStatus('');
      gateStatus('Sesión cerrada.');
      return load();
    }).catch(() => {
      // Aunque falle la red, la interfaz vuelve al acceso.
      return load();
    });
  }

  function onOrder(event) {
    event.preventDefault();
    const text = $('#adminOrderText');
    const instruction = String(text?.value || '').trim();
    if (instruction.length < 5) {
      orderStatus('Describe un poco más qué hay que arreglar.', 'error');
      return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    orderStatus('Enviando la orden...');
    if (button) button.disabled = true;
    post('/api/maya-agent/tasks', { instruction }).then(task => {
      if (text) text.value = '';
      orderStatus(`Orden #${task.task?.id || ''} en cola. El worker la recogerá cuando esté arrancado.`, 'ok');
      return load();
    }).catch(error => {
      orderStatus(error.message || 'No se pudo enviar la orden.', 'error');
      if (/sesión|administrador/i.test(error.message || '')) load();
    }).finally(() => {
      if (button) button.disabled = false;
    });
  }

  function openMaya() {
    window.showView?.('chat');
    setTimeout(() => {
      const input = $('#chatInput');
      if (!input) return;
      input.value = 'agente: ';
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 260);
  }

  function bind() {
    $('#adminLoginForm')?.addEventListener('submit', onLogin);
    $('#adminSetupForm')?.addEventListener('submit', onSetup);
    $('#adminLogout')?.addEventListener('click', onLogout);
    $('#adminSwitchAccount')?.addEventListener('click', onLogout);
    $('#adminRefresh')?.addEventListener('click', () => load());
    $('#adminOrderForm')?.addEventListener('submit', onOrder);
    $('#adminOpenMaya')?.addEventListener('click', openMaya);

    document.addEventListener('viewchange', event => {
      if (event.detail?.name === 'admin') load();
    });
  }

  bind();
  if (document.getElementById('view-admin')?.classList.contains('active')) load();
  window.addEventListener('load', () => {
    if (document.getElementById('view-admin')?.classList.contains('active')) load();
  });

  // Refresco suave mientras el panel está abierto: la orden y el progreso del
  // worker aparecen sin pulsar nada. Se pausa al cambiar de pestaña o de vista.
  setInterval(() => {
    if (!state.admin) return;
    if (document.visibilityState !== 'visible') return;
    if (!document.getElementById('view-admin')?.classList.contains('active')) return;
    load();
  }, 5000);
})();
