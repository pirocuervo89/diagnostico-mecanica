import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dividirTexto } from '../src/routes/tts.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-tts-'));
const PORT = 4168;
const BASE = `http://127.0.0.1:${PORT}`;
let falso = null;
let servidor = null;
const pedidos = [];

async function esperar(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* arrancando */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('El servidor no arrancó para la prueba de voz');
}

before(async () => {
  // Google TTS real no se llama en pruebas: un servidor local devuelve MP3
  // válidos y comprueba cuántos trozos pide y de qué tamaño.
  falso = http.createServer((req, res) => {
    const q = new URL(req.url, 'http://x').searchParams.get('q') || '';
    pedidos.push(q);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.end(Buffer.alloc(2048, 1));
  });
  await new Promise(r => falso.listen(0, '127.0.0.1', r));
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      TTS_BASE_URL: `http://127.0.0.1:${falso.address().port}/tts`,
      RUTA_DB_PATH: path.join(TMP, 'ruta.sqlite'),
      FORUM_DB_PATH: path.join(TMP, 'forum.sqlite'),
      FORUM_UPLOAD_DIR: path.join(TMP, 'forum-uploads'),
      GARAGE_UPLOAD_DIR: path.join(TMP, 'garage-uploads'),
      TUTORIAL_DB_PATH: path.join(TMP, 'tutorials.sqlite'),
      AI_PROVIDER: '', AI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      MISTRAL_API_KEY: '', CEREBRAS_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
      POLLINATIONS_ENABLED: '0', NODE_ENV: 'test'
    },
    stdio: 'ignore'
  });
  await esperar();
});

after(async () => {
  servidor?.kill('SIGTERM');
  await new Promise(r => falso?.close(r));
  setTimeout(() => {
    try { rmSync(TMP, { recursive: true, force: true }); } catch { /* aún abierto */ }
  }, 300);
});

test('el texto se parte en frases de como mucho 190 caracteres sin cortar palabras', () => {
  const texto = 'Comprueba el nivel de aceite con el motor frío. ' .repeat(6).trim();
  const trozos = dividirTexto(texto);
  assert.ok(trozos.length >= 2, 'un texto largo debe dar varios trozos');
  for (const trozo of trozos) {
    assert.ok(trozo.length <= 190, `trozo demasiado largo: ${trozo.length}`);
    assert.ok(!/^\s|\s$/.test(trozo), 'sin espacios en los extremos');
  }
  assert.equal(trozos.join(' ').replace(/\s+/g, ' '), texto.replace(/\s+/g, ' '));
});

test('una respuesta de más de 200 caracteres devuelve audio encadenado y no 502', async () => {
  pedidos.length = 0;
  const texto = 'Revisa el nivel de aceite y el refrigerante antes de arrancar. ' .repeat(4)
    + 'Si el testigo sigue encendido, no circules y consulta el código DTC.';
  assert.ok(texto.length > 200 && texto.length < 1000);
  const r = await fetch(`${BASE}/api/tts?tl=es&q=${encodeURIComponent(texto)}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /audio\/mpeg/);
  assert.ok(Number(r.headers.get('x-voz-trozos')) >= 2);
  const audio = Buffer.from(await r.arrayBuffer());
  assert.ok(audio.length >= 1200);
  assert.ok(pedidos.length >= 2);
  for (const pedido of pedidos) assert.ok(pedido.length <= 190, `trozo enviado a Google: ${pedido.length}`);
});
