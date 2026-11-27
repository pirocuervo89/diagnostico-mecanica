#!/usr/bin/env node
/**
 * Worker local del taller de Maya.
 *
 * La web solo encola órdenes de un administrador. Este proceso, que corre en
 * tu máquina (donde está el repositorio y OpenCode), las recoge, deja que
 * OpenCode las arregle, pasa las pruebas y hace commit/push.
 *
 * Variables:
 *   MAYA_AGENT_URL=https://diagnostico-mecanica.onrender.com
 *   MAYA_AGENT_TOKEN=...            (el mismo que en Render)
 *   MAYA_AGENT_REPO=/ruta/al/repo   (por defecto, el directorio actual)
 *   MAYA_AGENT_OPENCODE=opencode    (ruta al CLI de OpenCode)
 *   MAYA_AGENT_MODEL=proveedor/modelo (opcional)
 *   MAYA_AGENT_PUSH=0               (opcional: commit sin push)
 *   MAYA_AGENT_TESTS=0              (opcional: no recomendado)
 *   MAYA_AGENT_ONCE=1               (opcional: una pasada y salir)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const BASE = String(process.env.MAYA_AGENT_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const TOKEN = String(process.env.MAYA_AGENT_TOKEN || '');
const REPO = path.resolve(process.env.MAYA_AGENT_REPO || process.cwd());
const OPENCODE = process.env.MAYA_AGENT_OPENCODE || 'opencode';
const MODEL = process.env.MAYA_AGENT_MODEL || '';
const PUSH = process.env.MAYA_AGENT_PUSH !== '0';
const RUN_TESTS = process.env.MAYA_AGENT_TESTS !== '0';
const ONCE = process.env.MAYA_AGENT_ONCE === '1';
const OPENCODE_TIMEOUT = Number(process.env.MAYA_AGENT_OPENCODE_TIMEOUT_MS || 20 * 60_000);
const TEST_TIMEOUT = Number(process.env.MAYA_AGENT_TEST_TIMEOUT_MS || 15 * 60_000);

if (TOKEN.length < 16) {
  console.error('Falta MAYA_AGENT_TOKEN (mínimo 16 caracteres).');
  process.exit(1);
}

function run(cmd, args, { timeout = 120_000, cwd = REPO } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', chunk => { out += chunk; if (out.length > 80_000) out = out.slice(-80_000); });
    child.stderr.on('data', chunk => { out += chunk; if (out.length > 80_000) out = out.slice(-80_000); });
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ code: -1, out: `${out}\n${error.message}`, timedOut });
    });
    child.on('exit', code => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, timedOut });
    });
  });
}

async function api(endpoint, body) {
  const response = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-token': TOKEN },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function report(taskId, payload) {
  await api(`/api/maya-agent/tasks/${taskId}/result`, payload);
}

async function progress(taskId, message) {
  try {
    await api(`/api/maya-agent/tasks/${taskId}/progress`, { message });
  } catch (error) {
    // El progreso es informativo: si falla, la orden sigue su curso.
    console.warn(`[maya-agent] No se pudo publicar el progreso: ${error.message}`);
  }
}

function tail(text, max = 1800) {
  const clean = String(text || '').trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
}

async function processTask(task) {
  console.log(`[maya-agent] Orden #${task.id}: ${task.instruction}`);
  await progress(task.id, 'Comprobando que el repositorio está limpio…');
  const status = await run('git', ['status', '--porcelain', '--untracked-files=no']);
  if (status.code !== 0) {
    await report(task.id, { status: 'error', summary: `No se pudo leer git: ${tail(status.out)}` });
    return;
  }
  if (status.out.trim()) {
    await report(task.id, {
      status: 'error',
      summary: 'El repositorio tiene cambios sin commit. El worker no mezcla tu trabajo con el de Maya: haz commit o stash antes de encolar otra orden.'
    });
    return;
  }

  await progress(task.id, `OpenCode está trabajando${MODEL ? ` con ${MODEL}` : ''}…`);
  const args = ['run', '--auto'];
  if (MODEL) args.push('-m', MODEL);
  args.push(task.instruction);
  const agent = await run(OPENCODE, args, { timeout: OPENCODE_TIMEOUT });
  if (agent.code !== 0) {
    await report(task.id, {
      status: 'error',
      summary: `${agent.timedOut ? 'OpenCode agotó el tiempo.' : 'OpenCode terminó con error.'}\n${tail(agent.out)}`
    });
    return;
  }

  if (RUN_TESTS) {
    await progress(task.id, 'Pasando las pruebas antes de guardar…');
    const tests = await run('npm', ['test'], { timeout: TEST_TIMEOUT });
    if (tests.code !== 0) {
      await report(task.id, {
        status: 'error',
        summary: `Los cambios no pasan las pruebas; no se hace commit.\n${tail(tests.out, 2600)}`
      });
      return;
    }
  }

  await progress(task.id, 'Preparando el commit…');
  await run('git', ['add', '-A', '--', '.', ':(exclude)data/products.json']);
  const staged = await run('git', ['diff', '--cached', '--quiet']);
  if (staged.code === 0) {
    await report(task.id, { status: 'done', summary: 'OpenCode terminó sin cambios que guardar.' });
    return;
  }

  const message = `Maya: ${task.instruction.replace(/\s+/g, ' ').slice(0, 80)}\n\nOrden #${task.id} desde el taller de Maya.\n\n🤖 Generado con OpenCode desde el worker local.`;
  const commit = await run('git', ['commit', '-m', message]);
  if (commit.code !== 0) {
    await report(task.id, { status: 'error', summary: `No se pudo hacer commit.\n${tail(commit.out)}` });
    return;
  }
  const hashResult = await run('git', ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.out.trim();

  let pushed = false;
  let summary = `Cambios guardados en el commit ${hash}.`;
  if (PUSH) {
    await progress(task.id, 'Subiendo al repositorio…');
    const push = await run('git', ['push'], { timeout: 120_000 });
    if (push.code !== 0) {
      await report(task.id, { status: 'error', summary: `Commit ${hash} creado, pero el push falló.\n${tail(push.out)}`, commit: hash, pushed: false });
      return;
    }
    pushed = true;
    summary += ' Subido al repositorio.';
  } else {
    summary += ' Push desactivado (MAYA_AGENT_PUSH=0).';
  }
  await report(task.id, { status: 'done', summary, commit: hash, pushed });
  console.log(`[maya-agent] Orden #${task.id} terminada: ${hash}${pushed ? ' (push)' : ''}`);
}

async function loop() {
  console.log(`[maya-agent] Worker listo. Servidor: ${BASE} · repo: ${REPO} · push: ${PUSH ? 'sí' : 'no'}`);
  for (;;) {
    let task = null;
    try {
      // Long-poll: si no hay orden, el servidor mantiene la conexión hasta 20 s
      // y devuelve la orden en cuanto llega. En modo de una pasada se consulta
      // una vez para no quedarse esperando.
      const data = ONCE
        ? await api('/api/maya-agent/next', {})
        : await api('/api/maya-agent/wait', { timeoutMs: 20000 });
      task = data.task;
    } catch (error) {
      console.error(`[maya-agent] No se pudo consultar la cola: ${error.message}`);
    }
    if (task) {
      try {
        await processTask(task);
      } catch (error) {
        console.error(`[maya-agent] Error procesando #${task.id}: ${error.message}`);
        try {
          await report(task.id, { status: 'error', summary: `Error del worker: ${error.message}` });
        } catch { /* la cola lo mostrará como running */ }
      }
    }
    if (ONCE) return;
    await new Promise(resolve => setTimeout(resolve, task ? 1000 : 500));
  }
}

loop().catch(error => {
  console.error(`[maya-agent] Worker detenido: ${error.message}`);
  process.exit(1);
});
